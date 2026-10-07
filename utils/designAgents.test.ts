import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DESIGN_AGENTS, DEFAULT_AGENT, loadAgent, saveAgent } from './designAgents';

const KEY = 'kollektiv.designAgent';

describe('designAgents', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('lists the five agents with unique ids and a non-empty hint each', () => {
    expect(DESIGN_AGENTS.map((a) => a.label)).toEqual(['Claude Code', 'Codex', 'Gemini CLI', 'Cursor', 'Other']);
    expect(new Set(DESIGN_AGENTS.map((a) => a.id)).size).toBe(5);
    DESIGN_AGENTS.forEach((a) => expect(a.hint.length).toBeGreaterThan(10));
  });

  it('defaults to Claude Code when nothing is stored', () => {
    expect(DEFAULT_AGENT).toBe('claude-code');
    expect(loadAgent()).toBe('claude-code');
  });

  it('round-trips every agent', () => {
    for (const { id } of DESIGN_AGENTS) {
      saveAgent(id);
      expect(loadAgent()).toBe(id);
    }
  });

  it('ignores an invalid stored value', () => {
    localStorage.setItem(KEY, 'emacs');
    expect(loadAgent()).toBe('claude-code');
  });

  it('survives blocked storage on both read and write', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(loadAgent()).toBe('claude-code');
    expect(() => saveAgent('cursor')).not.toThrow();
  });
});
