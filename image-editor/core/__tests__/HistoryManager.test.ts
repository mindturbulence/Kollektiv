import { describe, it, expect, beforeEach } from 'vitest';
import { pushCommand, undo, redo, canUndo, canRedo, clearHistory } from '../history/HistoryManager';
import { getSnapshot, resetStore } from '../store';
import type { HistoryCommand } from '../types';

function makeCmd(label = 'cmd') {
  let doCount = 0;
  return {
    cmd: {
      id: crypto.randomUUID(), label, timestamp: Date.now(),
      do: () => { doCount++; },
      undo: () => { doCount--; },
    } satisfies HistoryCommand,
    get doCount() { return doCount; },
  };
}

describe('HistoryManager', () => {
  beforeEach(() => {
    resetStore();
  });

  it('pushCommand calls do() and adds the command to history', () => {
    const a = makeCmd();
    pushCommand(a.cmd);

    expect(canUndo()).toBe(true);
    expect(canRedo()).toBe(false);
    expect(a.doCount).toBe(1);
  });

  it('undo calls command.undo() and decrements historyIndex', () => {
    const a = makeCmd('a');
    const b = makeCmd('b');
    pushCommand(a.cmd);
    pushCommand(b.cmd);

    undo();

    expect(b.doCount).toBe(0);
    expect(getSnapshot().historyIndex).toBe(0);
    expect(canUndo()).toBe(true);
    expect(canRedo()).toBe(true);
  });

  it('redo calls command.do() and increments historyIndex', () => {
    const a = makeCmd('a');
    const b = makeCmd('b');
    pushCommand(a.cmd);
    pushCommand(b.cmd);
    undo();

    redo();

    expect(b.doCount).toBe(1);
    expect(getSnapshot().historyIndex).toBe(1);
    expect(canRedo()).toBe(false);
  });

  it('pushing a new command after undo clears the redo branch', () => {
    const a = makeCmd('a');
    const b = makeCmd('b');
    const c = makeCmd('c');
    pushCommand(a.cmd);
    pushCommand(b.cmd);
    undo();

    pushCommand(c.cmd);

    const snap = getSnapshot();
    expect(snap.history.length).toBe(2);
    expect(snap.historyIndex).toBe(1);
    expect(canRedo()).toBe(false);
  });

  it('caps history at 50 commands, preserving the most recent', () => {
    const cmds = Array.from({ length: 51 }, (_, i) => makeCmd(`cmd-${i}`));
    for (const { cmd } of cmds) pushCommand(cmd);

    const snap = getSnapshot();
    expect(snap.history.length).toBe(50);
    expect(cmds[50].doCount).toBe(1);
    expect(snap.history[snap.history.length - 1].id).toBe(cmds[50].cmd.id);
  });

  it('canUndo/canRedo are correct at boundaries', () => {
    expect(canUndo()).toBe(false);
    expect(canRedo()).toBe(false);

    const a = makeCmd('a');
    pushCommand(a.cmd);
    expect(canUndo()).toBe(true);
    expect(canRedo()).toBe(false);

    undo();
    expect(canUndo()).toBe(false);
    expect(canRedo()).toBe(true);
  });

  it('clearHistory resets history and historyIndex', () => {
    pushCommand(makeCmd('a').cmd);
    pushCommand(makeCmd('b').cmd);
    pushCommand(makeCmd('c').cmd);

    clearHistory();

    const snap = getSnapshot();
    expect(snap.history.length).toBe(0);
    expect(snap.historyIndex).toBe(-1);
    expect(canUndo()).toBe(false);
  });
});
