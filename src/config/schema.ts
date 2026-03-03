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

export const webhookSchema = z.object({
  type: z.enum(['feishu']),
  name: z.string().min(1, 'webhook name is required'),
  url: z.string().url('webhook url must be a valid URL'),
  enabled: z.boolean().default(true),
})

export const webhooksSchema = z.array(webhookSchema).optional()

export const optionsSchema = z
  .object({
    maxItems: z.number().int().positive().default(10),
    maxContentLength: z.number().int().positive().default(65536),
    concurrency: z.number().int().positive().default(8),
    fetchTimeout: z.number().int().positive().default(20000),
    llmTimeout: z.number().int().positive().default(60000),
  })
  .default({
    maxItems: 10,
    maxContentLength: 65536,
    concurrency: 8,
    fetchTimeout: 20000,
    llmTimeout: 60000,
  })
export const configSchema = z.object({
  llm: llmConfigSchema,
  options: optionsSchema,
  webhooks: webhooksSchema,
})

export type LLMConfig = z.infer<typeof llmConfigSchema>
export type Source = z.infer<typeof sourceSchema>
export type Options = z.infer<typeof optionsSchema>
export type Config = z.infer<typeof configSchema>
export type Webhook = z.infer<typeof webhookSchema>
