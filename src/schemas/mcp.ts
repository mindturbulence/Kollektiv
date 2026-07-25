import { z } from 'zod';

export const McpProxySchema = z.object({
  url: z.string().url(),
  method: z.string().optional(),
  params: z.any().optional(),
  headers: z.record(z.string()).optional(),
});
