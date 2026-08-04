import { describe, it, expect, vi } from 'vitest';
import { resolveVoiceSilenceTimeoutMs, selectLiveTools, LIVE_API_MAX_FUNCTION_DECLARATIONS } from './liveAssistantService';
import type { AssistantTool } from './assistantTools';
import type { LLMSettings } from '../types';

describe('resolveVoiceSilenceTimeoutMs', () => {
    it('defaults to 800ms when the setting is unset', () => {
        expect(resolveVoiceSilenceTimeoutMs({} as LLMSettings)).toBe(800);
    });

    it('uses the configured value when set', () => {
        expect(resolveVoiceSilenceTimeoutMs({ voiceSilenceTimeoutMs: 500 } as LLMSettings)).toBe(500);
    });

    it('falls back to 800ms for an invalid (non-positive) configured value', () => {
        expect(resolveVoiceSilenceTimeoutMs({ voiceSilenceTimeoutMs: 0 } as LLMSettings)).toBe(800);
        expect(resolveVoiceSilenceTimeoutMs({ voiceSilenceTimeoutMs: -100 } as LLMSettings)).toBe(800);
    });
});

/** Build a stand-in AssistantTool for the selection helper. The real executor
 *  is never called by these tests, so `execute` is a noop. */
const fakeTool = (name: string): AssistantTool => ({
    name,
    description: `fake ${name}`,
    parameters: { type: 'object', properties: {} },
    execute: async () => '',
});

describe('selectLiveTools', () => {
    it('documents the documented Gemini Live 128-function-declaration cap', () => {
        // The Live API rejects setups exceeding this many function declarations
        // with 1011 "Internal error encountered." (Firebase AI Logic / Vertex
        // function-calling reference). If the cap changes upstream, update
        // both the constant and the test.
        expect(LIVE_API_MAX_FUNCTION_DECLARATIONS).toBe(128);
    });

    it('returns the combined list unchanged when it fits under the cap', () => {
        const builtIn = Array.from({ length: 50 }, (_, i) => fakeTool(`built_${i}`));
        const mcp = Array.from({ length: 30 }, (_, i) => fakeTool(`mcp_server_${i}`));
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

        const result = selectLiveTools(builtIn, mcp);

        expect(result).toHaveLength(80);
        expect(result).toEqual([...builtIn, ...mcp]);
        expect(warn).not.toHaveBeenCalled();
        warn.mockRestore();
    });

    it('returns the combined list unchanged when it exactly meets the cap', () => {
        const builtIn = Array.from({ length: 100 }, (_, i) => fakeTool(`built_${i}`));
        const mcp = Array.from({ length: 28 }, (_, i) => fakeTool(`mcp_server_${i}`));
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

        const result = selectLiveTools(builtIn, mcp);

        expect(result).toHaveLength(LIVE_API_MAX_FUNCTION_DECLARATIONS);
        expect(warn).not.toHaveBeenCalled();
        warn.mockRestore();
    });

    it('keeps all built-in tools and truncates MCP when the combined list exceeds the cap', () => {
        // Reproduces the user's reported failure mode: 430 built-in + 322 MCP.
        // 430 built-in alone already exceeds the cap, so the helper falls into
        // the built-in-saturates branch and drops all MCP tools.
        const builtIn = Array.from({ length: 430 }, (_, i) => fakeTool(`built_${i}`));
        const mcp = Array.from({ length: 322 }, (_, i) => fakeTool(`mcp_mrt3xgpb_${i}`));
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

        const result = selectLiveTools(builtIn, mcp);

        expect(result).toHaveLength(LIVE_API_MAX_FUNCTION_DECLARATIONS);
        expect(result.filter((t) => t.name.startsWith('mcp_'))).toHaveLength(0);
        // First 128 items are the first 128 built-ins (deterministic truncation).
        expect(result).toEqual(builtIn.slice(0, LIVE_API_MAX_FUNCTION_DECLARATIONS));
        expect(warn).toHaveBeenCalled();
        warn.mockRestore();
    });

    it('truncates MCP but preserves all built-ins when the cap leaves room for some MCP', () => {
        // 100 built-in + 200 MCP = 300, cap = 128 → keep all 100 built-ins, first 28 MCP.
        const builtIn = Array.from({ length: 100 }, (_, i) => fakeTool(`built_${i}`));
        const mcp = Array.from({ length: 200 }, (_, i) => fakeTool(`mcp_mrt3xgpb-m0pm_tool_${i}`));
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

        const result = selectLiveTools(builtIn, mcp);

        expect(result).toHaveLength(LIVE_API_MAX_FUNCTION_DECLARATIONS);
        expect(result.slice(0, 100)).toEqual(builtIn);
        const keptMcp = result.slice(100);
        expect(keptMcp).toHaveLength(28);
        expect(keptMcp).toEqual(mcp.slice(0, 28));
        expect(warn).toHaveBeenCalledOnce();
        // Warning should name the omitted MCP server id so the user can act on it.
        expect(warn.mock.calls[0][0]).toContain('mrt3xgpb-m0pm');
        warn.mockRestore();
    });

    it('handles an empty MCP list (common when no MCP servers are enabled)', () => {
        const builtIn = Array.from({ length: 50 }, (_, i) => fakeTool(`built_${i}`));
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

        const result = selectLiveTools(builtIn, []);

        expect(result).toEqual(builtIn);
        expect(warn).not.toHaveBeenCalled();
        warn.mockRestore();
    });

    it('respects a custom max argument (forward-compat with possible future model limits)', () => {
        const builtIn = Array.from({ length: 5 }, (_, i) => fakeTool(`built_${i}`));
        const mcp = Array.from({ length: 10 }, (_, i) => fakeTool(`mcp_s_${i}`));
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

        const result = selectLiveTools(builtIn, mcp, 8);

        expect(result).toHaveLength(8);
        expect(result.slice(0, 5)).toEqual(builtIn);
        expect(result.slice(5)).toEqual(mcp.slice(0, 3));
        warn.mockRestore();
    });
});
