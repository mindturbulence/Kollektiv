import { z } from 'zod';

// Schema for the payload sent to the free multi-engine web-search endpoint.
export const WebSearchRequestSchema = z.object({
  query: z.string().min(1).max(400),
  engines: z.array(z.string().min(1).max(32)).max(8).optional(),
  maxResults: z.number().int().min(1).max(30).optional(),
  fetchContent: z.boolean().optional(),
});
