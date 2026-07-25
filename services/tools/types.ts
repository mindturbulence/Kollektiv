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
}

/** Per-tool-call context. Mirrors the running conversation and AI settings. */
export interface ToolContext {
  /** Settings snapshot at the moment the tool was invoked. */
  settings: LLMSettings;
  /** Attachments on the user's current chat turn (images), if any. */
  attachments?: { data: string; mimeType: string; fileName?: string }[];
}
