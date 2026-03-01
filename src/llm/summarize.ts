import OpenAI from 'openai';
import { zodResponseFormat } from 'openai/helpers/zod';
import { summaryResponseSchema, summaryResponseLenientSchema, type SummaryResult } from './schemas';
import { getSystemPrompt, buildUserPrompt, buildFallbackUserPrompt } from './prompt';
import { logger } from '../utils/logger';

const MAX_SUMMARY_LENGTH = 500;

/**
 * Clamp importance to 1-5 range.
 */
function clampImportance(value: number): 1 | 2 | 3 | 4 | 5 {
  const clamped = Math.round(Math.min(5, Math.max(1, value)));
  return clamped as 1 | 2 | 3 | 4 | 5;
}

/**
 * Truncate summary to MAX_SUMMARY_LENGTH chars.
 */
function truncateSummary(summary: string): string {
  if (summary.length <= MAX_SUMMARY_LENGTH) {
    return summary;
  }
  return summary.slice(0, MAX_SUMMARY_LENGTH - 3) + '...';
}

/**
 * Extract JSON from a text response that may contain markdown code fences or other wrapping.
 */
function extractJson(text: string): string {
  // Try to extract from code fences first
  const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenceMatch) {
    return fenceMatch[1].trim();
  }
  // Try to find a JSON object directly
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    return jsonMatch[0];
  }
  return text.trim();
}

/**
 * Build a SummaryResult from parsed data, applying clamping and truncation.
 */
function buildResult(data: { title: string; summary: string; importance: number }): SummaryResult {
  return {
    title: data.title,
    summary: truncateSummary(data.summary),
    importance: clampImportance(data.importance),
  };
}

/**
 * Try structured output mode using zodResponseFormat.
 * Returns the parsed response or throws on failure.
 */
async function tryStructuredMode(
  client: OpenAI,
  model: string,
  sourceName: string,
  content: string,
): Promise<SummaryResult> {
  const response = await client.beta.chat.completions.parse({
    model,
    messages: [
      { role: 'system', content: getSystemPrompt() },
      { role: 'user', content: buildUserPrompt(sourceName, content) },
    ],
    response_format: zodResponseFormat(summaryResponseSchema, 'summary'),
  });

  const parsed = response.choices[0]?.message?.parsed;
  if (!parsed) {
    throw new Error('No parsed content in structured response');
  }

  return buildResult(parsed);
}

/**
 * Fallback mode: ask the LLM to return JSON in the prompt, then parse manually.
 */
async function tryFallbackMode(
  client: OpenAI,
  model: string,
  sourceName: string,
  content: string,
): Promise<SummaryResult> {
  const response = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: getSystemPrompt() },
      { role: 'user', content: buildFallbackUserPrompt(sourceName, content) },
    ],
  });

  const text = response.choices[0]?.message?.content;
  if (!text) {
    throw new Error('No content in fallback response');
  }

  const jsonStr = extractJson(text);
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    throw new Error(`Failed to parse JSON from LLM response: ${text.slice(0, 200)}`);
  }

  const result = summaryResponseLenientSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`Invalid LLM response shape: ${result.error.message}`);
  }

  return buildResult(result.data);
}

/**
 * Check if an error indicates that structured output is unsupported (400-class).
 */
function isStructuredOutputUnsupported(error: unknown): boolean {
  return error instanceof OpenAI.APIError && error.status === 400;
}

/**
 * Check if an error is an authentication failure.
 */
function isAuthError(error: unknown): boolean {
  return error instanceof OpenAI.APIError && error.status === 401;
}

/**
 * Summarize a content item using the LLM.
 *
 * Mode 1 (structured): Try zodResponseFormat with Zod schema.
 * Mode 2 (fallback): On 400 error, retry with prompt-based JSON.
 * On any unrecoverable error: return null (caller logs warning, skips item).
 */
export async function summarizeItem(
  client: OpenAI,
  model: string,
  content: string,
  sourceName: string,
): Promise<SummaryResult | null> {
  // Mode 1: Try structured output
  try {
    return await tryStructuredMode(client, model, sourceName, content);
  } catch (error) {
    // If auth error, provide clear message and return null
    if (isAuthError(error)) {
      logger.warn(`[LLM] Authentication failed: Invalid API key. Check your DAILYBREW_API_KEY or config.`);
      return null;
    }

    // If structured output unsupported (400), try fallback
    if (isStructuredOutputUnsupported(error)) {
      // Mode 2: Fallback to prompt-based JSON
      try {
        return await tryFallbackMode(client, model, sourceName, content);
      } catch (fallbackError) {
        if (isAuthError(fallbackError)) {
          logger.warn(`[LLM] Authentication failed: Invalid API key. Check your DAILYBREW_API_KEY or config.`);
          return null;
        }
        logger.warn(`[LLM] Fallback mode failed for "${sourceName}": ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`);
        return null;
      }
    }

    // Any other error (timeout, garbage, etc.): return null
    logger.warn(`[LLM] Failed to summarize "${sourceName}": ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}
