import { z } from 'zod'

/**
 * Zod schema for LLM summary response.
 * Used for both structured output (zodResponseFormat) and fallback JSON parsing.
 */
export const summaryResponseSchema = z.object({
  title: z.string(),
  summary: z.string(),
  importance: z.number().min(1).max(5),
})

/**
 * Lenient schema for fallback JSON parsing.
 * Accepts any number for importance (clamping happens after parse).
 */
export const summaryResponseLenientSchema = z.object({
  title: z.string(),
  summary: z.string(),
  importance: z.number(),
})

export type SummaryResponse = z.infer<typeof summaryResponseSchema>

/**
 * Result type returned by summarizeItem.
 * Includes clamped importance and truncated summary.
 */
export interface SummaryResult {
  title: string
  summary: string
  importance: 1 | 2 | 3 | 4 | 5
}
