import { z } from 'zod';

export const TopazUpscaleSchema = z.object({
  scale: z.string().regex(/^\d+$/).default('4'), // numeric string
  model: z.string().default('std'),
});
