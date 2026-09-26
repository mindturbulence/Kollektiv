import type { ActiveTab, WebResult } from '../types';

/** Payload shape shared by the palette/assistant "send to prompts page" flow. */
export type PromptsPageState = {
  prompt?: string;
  artStyle?: string;
  artist?: string;
  view?: 'enhancer' | 'composer' | 'create' | 'prompt_analyzer';
  id?: string;
} | null;

/** How the image editor is opened from outside (Gallery card, Composer, Assets Manager). */
export type OpenInEditorPayload = { galleryItemId: string; url: string } | { blob: Blob };

/**
 * Every event the app-wide bus carries, keyed by name. `void` marks events
 * emitted with no payload — `emit()` then takes no second argument.
 *
 * Payload shapes for `notesChanged` and `liveAssistantActivity` are inlined
 * rather than imported from utils/notesStorage.ts and services/liveAssistantService.ts:
 * both of those modules import this bus, so importing them back here would
 * create a runtime import cycle.
 */
export interface AppEvents {
  navigate: ActiveTab;
  assistantFeedback: { message: string; isError?: boolean };
  sendToPromptsPage: PromptsPageState;
  togglePanel: 'media' | 'clipping' | 'webviewer' | 'chat' | 'activity' | 'llm';
  /** Palette "Next Theme" command — cycles the active DaisyUI theme. */
  cycleTheme: void;
  openInEditor: OpenInEditorPayload;
  openInConverter: { files: File[] };
  notesChanged: { id: string; title: string; content: string; createdAt: number; updatedAt: number; source: 'assistant' | 'user' }[];
  assistantFilesChanged: void;
  playVideo: { url: string };
  openMediaPanel: { url: string; isSpotifyUri?: boolean };
  stopMedia: void;
  clipIdea: { prompt: string; title?: string; lens?: string; source?: string };
  liveAssistantState: { status: string; speaking?: boolean };
  liveCaption: { who: 'user' | 'assistant'; text: string };
  liveAssistantActivity: { flavour: string; toolName: string };
  chatSpeaking: { speaking: boolean };
  webSearchResults: WebResult[];
  webSearchError: string;
  webSearchLoading: void;
  chatSessionsChanged: void;
  mediaAttachment: { data: string; mimeType: string; fileName: string };
  googleTokenRefreshRequested: void;
  'research:findingsAppended': { slug: string };
}

type Listener<K extends keyof AppEvents> = (payload: AppEvents[K]) => void;
type EmitArgs<K extends keyof AppEvents> = AppEvents[K] extends void ? [] : [payload: AppEvents[K]];

class EventBus {
  // Storage is untyped internally — TS can't express "the value array's element
  // type depends on the key" for a plain Record. The public on/off/emit methods
  // below are what keep every call site type-safe; this cast never escapes them.
  private listeners: Record<string, Listener<any>[]> = {};

  on<K extends keyof AppEvents>(event: K, callback: Listener<K>): () => void {
    (this.listeners[event as string] ??= []).push(callback);
    return () => this.off(event, callback);
  }

  off<K extends keyof AppEvents>(event: K, callback: Listener<K>): void {
    const list = this.listeners[event as string];
    if (!list) return;
    this.listeners[event as string] = list.filter(cb => cb !== callback);
  }

  emit<K extends keyof AppEvents>(event: K, ...args: EmitArgs<K>): void {
    const list = this.listeners[event as string];
    if (!list) return;
    const payload = args[0] as AppEvents[K];
    list.forEach(cb => cb(payload));
  }
}

export const appEventBus = new EventBus();
