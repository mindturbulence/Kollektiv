// OWNED BY: actions agent. Placeholder signature so the store compiles.
// Contract: pure function. Returns the SAME project reference for a no-op
// (e.g. locked track, unknown id) and otherwise a new project plus an
// EditAction that exactly reverses the change when passed back to applyEdit.

import type { EditAction, Project } from '../types';

export function applyEdit(project: Project, action: EditAction): { project: Project; inverse: EditAction } {
  void action;
  return { project, inverse: { type: 'batch', actions: [], label: 'noop' } };
}
