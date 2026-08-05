/**
 * MCP Generation Bridge — WP6 of the Adaptation Roadmap.
 *
 * Bridges MCP tool calls that return image/video data into the gallery
 * and generation storage. Any MCP service that ships an image-generating
 * tool becomes reachable with zero adapter code — just a config entry.
 *
 * Flow:
 * 1. MCP tool returns content with image/video data
 * 2. bridgeMcpGeneration() detects the media type
 * 3. Creates a GalleryItem + Generation record
 * 4. The generation's backendId is 'mcp:<serverId>/<toolName>'
 */

import { addItemToGallery } from '../utils/galleryStorage';
import { saveGeneration, createGeneration } from '../utils/generationStorage';
import type { GenerateParams } from './generationBackend';

// ── Types ──────────────────────────────────────────────────────────────

export interface McpToolResult {
  /** Text content from the tool. */
  text?: string;
  /** Image content (base64 data URL or URL). */
  image?: string;
  /** Video content (URL). */
  video?: string;
  /** Whether this result contains media. */
  hasMedia: boolean;
  /** Detected media type. */
  mediaType?: 'image' | 'video';
}

// ── Detection ──────────────────────────────────────────────────────────

/**
 * Inspect MCP tool output to detect image/video content.
 * MCP tools may return content as an array of {type, text} objects,
 * or as a plain string.
 */
export function detectMcpMedia(output: unknown): McpToolResult {
  if (!output) return { hasMedia: false };

  // Array of content blocks (standard MCP format)
  if (Array.isArray(output)) {
    for (const block of output) {
      if (block.type === 'image' && block.image) {
        return { hasMedia: true, mediaType: 'image', image: block.image };
      }
      if (block.type === 'video' && block.video) {
        return { hasMedia: true, mediaType: 'video', video: block.video };
      }
      // Check for base64 data URLs in text blocks
      if (block.type === 'text' && typeof block.text === 'string') {
        const imgMatch = block.text.match(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/);
        if (imgMatch) {
          return { hasMedia: true, mediaType: 'image', image: imgMatch[0] };
        }
      }
    }
  }

  // Plain string output — check for data URLs or media URLs
  if (typeof output === 'string') {
    const imgMatch = output.match(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/);
    if (imgMatch) return { hasMedia: true, mediaType: 'image', image: imgMatch[0] };

    const vidMatch = output.match(/https?:\/\/[^\s]+\.(mp4|webm|mov)/i);
    if (vidMatch) return { hasMedia: true, mediaType: 'video', video: vidMatch[0] };
  }

  return { hasMedia: false };
}

// ── Bridge ─────────────────────────────────────────────────────────────

/**
 * Bridge an MCP tool call that returned media into the gallery + generation
 * storage. Returns the created gallery item id, or null if bridging failed.
 */
export async function bridgeMcpGeneration(params: {
  serverId: string;
  serverName: string;
  toolName: string;
  toolArgs: Record<string, unknown>;
  output: unknown;
  prompt?: string;
}): Promise<string | null> {
  const media = detectMcpMedia(params.output);
  if (!media.hasMedia || !media.mediaType) return null;

  const url = media.image || media.video;
  if (!url) return null;

  const backendId = `mcp:${params.serverId}/${params.toolName}`;
  const sources = [`${params.serverName} / ${params.toolName}`];

  try {
    // Create a Generation record first
    const genParams: GenerateParams = {
      prompt: params.prompt || JSON.stringify(params.toolArgs),
      width: 0,  // unknown from MCP
      height: 0,
      steps: 0,
      cfgScale: 0,
    };

    const gen = createGeneration({
      promptText: params.prompt || '',
      backendId,
      params: genParams,
      status: 'ok',
    });

    // Add to gallery
    const item = await addItemToGallery(
      media.mediaType,
      [url],
      sources,
      {
        defaultTitle: `${params.serverName} — ${params.toolName}`,
        prompt: params.prompt,
        generationId: gen.id,
      },
    );

    // Link the generation to the gallery item
    gen.resultItemIds = [item.id];
    await saveGeneration(gen);

    console.log(`[MCP Bridge] Bridged ${media.mediaType} from ${backendId} → gallery item ${item.id}`);
    return item.id;
  } catch (err) {
    console.error(`[MCP Bridge] Failed to bridge from ${backendId}:`, err);
    return null;
  }
}
