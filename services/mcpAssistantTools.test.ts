import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { LLMSettings } from '../types';

const listToolsMock = vi.fn();
const callToolMock = vi.fn();
vi.mock('./mcpService', () => ({
  mcpService: {
    listTools: (...args: any[]) => listToolsMock(...args),
    callTool: (...args: any[]) => callToolMock(...args),
  },
}));

const bridgeMcpGenerationMock = vi.fn();
vi.mock('./mcpGenerationBridge', async () => {
  const actual = await vi.importActual<typeof import('./mcpGenerationBridge')>('./mcpGenerationBridge');
  return {
    ...actual,
    bridgeMcpGeneration: (...args: any[]) => bridgeMcpGenerationMock(...args),
  };
});

import { loadMcpAssistantTools } from './mcpAssistantTools';

const settings = (overrides: Partial<LLMSettings> = {}): LLMSettings => ({
  mcpServers: [{ id: 'srv1', name: 'Test Server', url: 'http://localhost:1234', enabled: true }],
  ...overrides,
} as LLMSettings);

describe('loadMcpAssistantTools — generation bridging (WP6)', () => {
  beforeEach(() => {
    listToolsMock.mockReset();
    callToolMock.mockReset();
    bridgeMcpGenerationMock.mockReset();
  });

  it('bridges a tool call that returns media and appends a gallery note', async () => {
    listToolsMock.mockResolvedValue([{ name: 'generate_image', description: 'Generate an image', inputSchema: { properties: {} } }]);
    callToolMock.mockResolvedValue([{ type: 'image', image: 'data:image/png;base64,abc' }]);
    bridgeMcpGenerationMock.mockResolvedValue('item_123');

    const tools = await loadMcpAssistantTools(settings());
    expect(tools).toHaveLength(1);

    const result = await tools[0].execute({ prompt: 'a cat' }, {} as any);

    expect(bridgeMcpGenerationMock).toHaveBeenCalledWith(expect.objectContaining({
      serverId: 'srv1',
      serverName: 'Test Server',
      toolName: 'generate_image',
      prompt: 'a cat',
    }));
    expect(result).toContain('Saved to gallery as item item_123');
  });

  it('does not bridge a tool call that returns plain text', async () => {
    listToolsMock.mockResolvedValue([{ name: 'search', description: 'Search', inputSchema: { properties: {} } }]);
    callToolMock.mockResolvedValue([{ type: 'text', text: 'no media here' }]);

    const tools = await loadMcpAssistantTools(settings());
    const result = await tools[0].execute({}, {} as any);

    expect(bridgeMcpGenerationMock).not.toHaveBeenCalled();
    expect(result).toBe('no media here');
  });
});
