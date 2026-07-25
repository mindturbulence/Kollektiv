import { z } from 'zod';

// Schema for the payload sent to the Anthropic proxy endpoint.
export const AnthropicRequestSchema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(['user', 'assistant', 'system']),
      content: z.string(),
      attachments: z.array(z.any()).optional(),
    })
  ),
  settings: z.object({
    anthropicConnectionMode: z.enum(['subscription', 'api']).optional(),
    anthropicApiKey: z.string().optional(),
    anthropicSubscriptionKey: z.string().optional(),
    anthropicSubscriptionUrl: z.string().url().optional(),
    masterRolePrompt: z.string().optional(),
    anthropicModel: z.string().optional(),
  }).optional(),
  stream: z.boolean().optional(),
});
