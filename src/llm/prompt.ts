/**
 * Prompt templates for LLM summarization.
 */

const SYSTEM_PROMPT = `You are an expert content curator for a technical professional.
Analyze the following content and provide:
1. A clear, descriptive title (if the original title is vague or missing)
2. A concise summary (2-4 sentences, capture the key insight)
3. An importance rating from 1-5:
   - 5: Groundbreaking, industry-changing news
   - 4: Significant technical development or insight
   - 3: Interesting and worth knowing
   - 2: Mildly interesting, niche relevance
   - 1: Low relevance or redundant information

Respond in the SAME LANGUAGE as the source content.`;

/**
 * Build user prompt for structured output mode (zodResponseFormat handles format).
 */
export function buildUserPrompt(sourceName: string, content: string): string {
  return `Source: ${sourceName}\nContent:\n${content}`;
}

/**
 * Build user prompt for fallback mode — includes explicit JSON format instructions.
 */
export function buildFallbackUserPrompt(sourceName: string, content: string): string {
  return `Source: ${sourceName}
Content:
${content}

Respond ONLY with a valid JSON object in this exact format (no markdown, no code fences):
{"title": "...", "summary": "...", "importance": <number 1-5>}`;
}

/**
 * Get the system prompt.
 */
export function getSystemPrompt(): string {
  return SYSTEM_PROMPT;
}
