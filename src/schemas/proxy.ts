import { z } from 'zod';

export const ProxyRequestSchema = z.object({
  target: z.string().url(),
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).optional(),
  params: z.any().optional(),
  headers: z.record(z.string(), z.string()).optional(),
});
