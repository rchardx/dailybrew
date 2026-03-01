import { z } from 'zod'

export const llmConfigSchema = z.object({
  baseUrl: z.string().url('Invalid baseUrl: must be a valid URL'),
  apiKey: z.string().min(1, 'apiKey is required'),
  model: z.string().min(1, 'model is required'),
})

export const sourceSchema = z.object({
  name: z.string().min(1, 'source name is required'),
  url: z.string().url('source url must be a valid URL'),
  type: z.enum(['rss', 'web']).optional(),
  selector: z.string().optional(),
})

export const optionsSchema = z
  .object({
    maxItems: z.number().int().positive().default(50),
    maxContentLength: z.number().int().positive().default(4000),
    concurrency: z.number().int().positive().default(5),
  })
  .default({
    maxItems: 50,
    maxContentLength: 4000,
    concurrency: 5,
  })

export const configSchema = z.object({
  llm: llmConfigSchema,
  sources: z.array(sourceSchema).default([]),
  options: optionsSchema,
})

export type LLMConfig = z.infer<typeof llmConfigSchema>
export type Source = z.infer<typeof sourceSchema>
export type Options = z.infer<typeof optionsSchema>
export type Config = z.infer<typeof configSchema>
