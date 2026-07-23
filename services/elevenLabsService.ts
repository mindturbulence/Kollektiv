/**
 * ElevenLabs Conversational AI voice backend.
 *
 * Uses @elevenlabs/client SDK to create a VoiceConversation session
 * with a configured ElevenLabs agent. The SDK manages WebRTC, mic capture,
 * and audio playback internally — no manual RTCPeerConnection needed.
 *
 * Tools must be configured in both places:
 * 1. The ElevenLabs dashboard agent config (tool definitions)
 * 2. The clientTools registry below (tool execution)
 */

import { VoiceConversation } from '@elevenlabs/client';
import type { ToolContext } from './assistantTools';
import type { LLMSettings } from '../types';

export interface ElevenLabsHandlers {
  onStatus: (s: 'connecting' | 'live' | 'closed' | 'error', detail?: string) => void;
  onCaption: (who: 'user' | 'assistant', text: string) => void;
  onSpeaking: (speaking: boolean) => void;
  onCamera?: (active: boolean) => void;
  onTurnState?: (state: 'idle' | 'listening' | 'processing' | 'responding') => void;
}

export class ElevenLabsAssistant {
  private conversation: VoiceConversation | null = null;
  private handlers!: ElevenLabsHandlers;

  async connect(settings: LLMSettings, handlers: ElevenLabsHandlers): Promise<void> {
    this.handlers = handlers;
    handlers.onStatus('connecting');

    const apiKey = settings.elevenlabsApiKey || process.env.ELEVENLABS_API_KEY;
    const agentId = settings.elevenlabsAgentId;

    if (!apiKey) throw new Error('ElevenLabs API key not configured. Add it in Settings > Integrations.');
    if (!agentId) throw new Error('ElevenLabs Agent ID not configured. Create an agent in the ElevenLabs dashboard first.');

    // Build client tools registry — the ElevenLabs agent calls these when
    // the user's prompt matches a tool configured in the dashboard.
    const clientTools: Record<string, (params: any) => Promise<string | number | void>> = {};
    const toolNames = ['get_weather', 'get_time', 'search'] as const;
    for (const name of toolNames) {
      clientTools[name] = async (params) => {
        handlers.onCaption('assistant', `[using ${name}…]`);
        try {
          const result = await executeTool(name, params, settings);
          return typeof result === 'string' ? result : JSON.stringify(result);
        } catch (err) {
          return JSON.stringify({ error: String(err) });
        }
      };
    }

    try {
      this.conversation = await VoiceConversation.startSession({
        agentId,
        overrides: {
          agent: {
            prompt: {
              prompt: settings.assistantPersonality || 'You are a helpful assistant named Kollektiv.',
            },
          },
        },
        clientTools,
        onConnect: () => handlers.onStatus('live'),
        onDisconnect: () => {
          handlers.onStatus('closed');
          this.conversation = null;
        },
        onError: (msg, _ctx) => {
          handlers.onStatus('error', msg);
        },
        onMessage: ({ message, role }) => {
          if (message) handlers.onCaption(role === 'user' ? 'user' : 'assistant', message);
        },
        onInterruption: () => {
          handlers.onSpeaking(false);
        },
        onModeChange: ({ mode }) => {
          handlers.onSpeaking(mode === 'speaking');
          handlers.onTurnState?.(mode === 'speaking' ? 'responding' : 'listening');
        },
      });

      handlers.onStatus('live');
    } catch (err) {
      handlers.onStatus('error', String(err));
      this.conversation = null;
      throw err;
    }
  }

  disconnect(): void {
    this.conversation?.endSession().catch(() => {});
    this.conversation = null;
    this.handlers?.onSpeaking(false);
    this.handlers?.onStatus('closed');
  }

  setMicEnabled(enabled: boolean): boolean {
    if (!this.conversation) return false;
    this.conversation.setMicMuted(!enabled);
    return true;
  }

  // Screen sharing / camera is not supported via ElevenLabs Conversational AI
  // — the SDK manages audio I/O internally and doesn't expose a way to add
  // arbitrary video tracks. Users who want video must pick Gemini or OpenAI.
  startScreenShare(): Promise<void> {
    return Promise.resolve();
  }
  stopScreenShare(): void {}
  startCamera(): Promise<MediaStream> {
    return Promise.reject(new Error('Camera is not supported by the ElevenLabs voice backend. Switch to Gemini Live or OpenAI Realtime.'));
  }
  stopCamera(): void {}
}

// ── helpers ───────────────────────────────────────────────────────────

async function executeTool(name: string, args: Record<string, any>, settings: LLMSettings): Promise<string> {
  const ctx: ToolContext = { settings };
  // Dynamic import to avoid circular dep at module level
  const { executeAssistantTool } = await import('./assistantTools');
  return executeAssistantTool(name, args, ctx);
}
