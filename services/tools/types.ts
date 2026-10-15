import type { LLMSettings } from '../../types';

/**
 * Shared shape of an assistant tool.
 *
 * Defined in its own module so that per-category tool modules
 * (browser, gmail, obsidian, etc.) can reference the type without
 * a hard dependency on `services/assistantTools.ts`, which concatenates
 * them.
 */
export interface AssistantTool {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, Record<string, any>>;
    required?: string[];
  };
  execute: (args: Record<string, any>, ctx: ToolContext) => Promise<string> | string;
  /** Destructive tool: the first call is parked and the assistant must ask the user aloud
   *  (see services/confirmationGate.ts). */
  requiresConfirmation?: boolean;
  /** Runs before `execute`; returns a function that reverses the call given its result string,
   *  or null when there is nothing to undo. Surfaces as an Undo button in the Activity footer. */
  prepareUndo?: (args: Record<string, any>) => Promise<((result: string) => Promise<string>) | null>;
}

/** Per-tool-call context. Mirrors the running conversation and AI settings. */
export interface ToolContext {
  /** Settings snapshot at the moment the tool was invoked. */
  settings: LLMSettings;
  /** Attachments on the user's current chat turn (images), if any. */
  attachments?: { data: string; mimeType: string; fileName?: string }[];
}
