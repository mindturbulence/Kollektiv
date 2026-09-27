// Bounded undo/redo stack of (action, inverse) pairs.
// undo() hands back the inverse to apply; redo() hands back the original.

export class History<A> {
  private done: Array<{ action: A; inverse: A }> = [];
  private undone: Array<{ action: A; inverse: A }> = [];

  constructor(private readonly cap: number) {}

  push(action: A, inverse: A): void {
    this.done.push({ action, inverse });
    if (this.done.length > this.cap) this.done.shift();
    this.undone = [];
  }

  undo(): A | null {
    const step = this.done.pop();
    if (!step) return null;
    this.undone.push(step);
    return step.inverse;
  }

  redo(): A | null {
    const step = this.undone.pop();
    if (!step) return null;
    this.done.push(step);
    return step.action;
  }

  canUndo(): boolean { return this.done.length > 0; }
  canRedo(): boolean { return this.undone.length > 0; }
  clear(): void { this.done = []; this.undone = []; }
}
