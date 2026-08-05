import { describe, it, expect, vi, beforeEach } from 'vitest';
import { detectMcpMedia, bridgeMcpGeneration } from './mcpGenerationBridge';

// Mock gallery and generation storage
vi.mock('../utils/galleryStorage', () => ({
  addItemToGallery: vi.fn().mockResolvedValue({ id: 'item_test_123' }),
}));

vi.mock('../utils/generationStorage', () => ({
  saveGeneration: vi.fn().mockResolvedValue(undefined),
  createGeneration: vi.fn().mockReturnValue({
    id: 'gen_test_123',
    createdAt: Date.now(),
    promptText: 'test',
    backendId: 'mcp:test/tool',
    params: { prompt: 'test', width: 0, height: 0, steps: 0, cfgScale: 0 },
    resultItemIds: [],
    status: 'ok',
  }),
}));

describe('detectMcpMedia', () => {
  it('detects image in MCP content blocks', () => {
    const result = detectMcpMedia([
      { type: 'text', text: 'Here is your image:' },
      { type: 'image', image: 'data:image/png;base64,abc123' },
    ]);
    expect(result.hasMedia).toBe(true);
    expect(result.mediaType).toBe('image');
    expect(result.image).toBe('data:image/png;base64,abc123');
  });

  it('detects video in MCP content blocks', () => {
    const result = detectMcpMedia([
      { type: 'video', video: 'https://example.com/output.mp4' },
    ]);
    expect(result.hasMedia).toBe(true);
    expect(result.mediaType).toBe('video');
    expect(result.video).toBe('https://example.com/output.mp4');
  });

  it('detects base64 image in text output', () => {
    const result = detectMcpMedia([
      { type: 'text', text: 'Result: data:image/jpeg;base64,/9j/4AAQ...' },
    ]);
    expect(result.hasMedia).toBe(true);
    expect(result.mediaType).toBe('image');
  });

  it('returns hasMedia false for text-only output', () => {
    const result = detectMcpMedia([
      { type: 'text', text: 'No media here' },
    ]);
    expect(result.hasMedia).toBe(false);
  });

  it('handles null/undefined input', () => {
    expect(detectMcpMedia(null).hasMedia).toBe(false);
    expect(detectMcpMedia(undefined).hasMedia).toBe(false);
  });

  it('handles plain string with data URL', () => {
    const result = detectMcpMedia('data:image/png;base64,abc123');
    expect(result.hasMedia).toBe(true);
    expect(result.mediaType).toBe('image');
  });

  it('handles plain string with video URL', () => {
    const result = detectMcpMedia('https://example.com/video.mp4');
    expect(result.hasMedia).toBe(true);
    expect(result.mediaType).toBe('video');
  });
});

describe('bridgeMcpGeneration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('bridges image output to gallery + generation', async () => {
    const { addItemToGallery } = await import('../utils/galleryStorage');
    const { saveGeneration, createGeneration } = await import('../utils/generationStorage');

    const result = await bridgeMcpGeneration({
      serverId: 'test',
      serverName: 'Test Server',
      toolName: 'generate_image',
      toolArgs: { prompt: 'a cat' },
      output: [{ type: 'image', image: 'data:image/png;base64,abc' }],
    });

    expect(result).toBe('item_test_123');
    expect(createGeneration).toHaveBeenCalledWith(expect.objectContaining({
      backendId: 'mcp:test/generate_image',
      promptText: '',
    }));
    expect(addItemToGallery).toHaveBeenCalledWith(
      'image',
      ['data:image/png;base64,abc'],
      ['Test Server / generate_image'],
      expect.objectContaining({ generationId: 'gen_test_123' }),
    );
    expect(saveGeneration).toHaveBeenCalled();
  });

  it('returns null for text-only output', async () => {
    const result = await bridgeMcpGeneration({
      serverId: 'test',
      serverName: 'Test',
      toolName: 'tool',
      toolArgs: {},
      output: [{ type: 'text', text: 'no media' }],
    });
    expect(result).toBeNull();
  });
});
