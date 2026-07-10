import type { LLMSettings } from '../types';
import { getGeminiClient } from './geminiService';
import { executeAssistantTool, geminiToolDeclarations } from './assistantTools';

export type ChatMsg = { role: 'user' | 'assistant' | 'system'; content: string; attachments?: { data: string; mimeType: string; fileName?: string }[] };

export type AssistantEvent =
    | { type: 'text'; chunk: string }
    | { type: 'tool_start'; name: string; args: Record<string, any> }
    | { type: 'tool_result'; name: string; result: string }
    | { type: 'turn_end' };   // one assistant message finished (a new one may start after tools)

const MAX_TOOL_ROUNDS = 8;

/** Builds the assistant's system prompt from the configured persona
 * (Settings > Integrations > Assistant). Used by every provider path,
 * text and live voice alike, so persona stays consistent everywhere. */
export const buildSystemIdentity = (settings: LLMSettings): string => {
    const name = settings.assistantName?.trim() || 'the Kollektiv assistant';
    const lines = [
        `You are ${name}, embedded in a local-first creative suite for prompt engineering and media management. Be concise. Use your tools to act on the app when the user asks for something the tools can do; report what you did.`,
    ];
    if (settings.assistantLanguage?.trim()) {
        lines.push(`Always respond in ${settings.assistantLanguage.trim()}, regardless of what language the user writes or speaks in, unless they explicitly ask you to switch.`);
    }
    if (settings.assistantPersonality?.trim()) {
        lines.push(settings.assistantPersonality.trim());
    }
    return lines.join(' ');
};

// The assistant always reasons on Gemini (native function calling), independent of
// whichever engine is active for the rest of the app. Switching the footer's LLM
// engine changes what PromptCrafter/Refiner/etc. use for manual work — it must not
// change what the assistant itself runs on.
export async function* runAssistantTurn(messages: ChatMsg[], settings: LLMSettings): AsyncGenerator<AssistantEvent> {
    yield* runGeminiTurn(messages, settings);
}

// ---------------- Gemini: native function calling ----------------

async function* runGeminiTurn(messages: ChatMsg[], settings: LLMSettings): AsyncGenerator<AssistantEvent> {
    const ai = getGeminiClient(settings);
    const model = settings.llmModel || 'gemini-3.5-flash';
    const systemText = [buildSystemIdentity(settings), ...messages.filter(m => m.role === 'system').map(m => m.content)].join('\n\n');
    const contents: any[] = messages
        .filter(m => m.role !== 'system')
        .map(m => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [
                { text: m.content },
                ...(m.attachments || [])
                    .filter(a => a.mimeType.startsWith('image/'))
                    .map(a => ({ inlineData: { mimeType: a.mimeType, data: a.data.includes('base64,') ? a.data.split('base64,')[1] : a.data } })),
            ],
        }));

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        const stream = await ai.models.generateContentStream({
            model,
            contents,
            config: {
                systemInstruction: systemText,
                tools: [{ functionDeclarations: geminiToolDeclarations() as any }],
            },
        });

        const calls: { id?: string; name: string; args: Record<string, any> }[] = [];
        // Accumulate the model's raw parts (not hand-rebuilt ones) so any
        // thoughtSignature Gemini attaches to a functionCall part survives
        // being echoed back next round — dropping it makes 2.5+/3.x models
        // reject the follow-up request with a 400.
        const modelParts: any[] = [];
        for await (const chunk of stream) {
            if (chunk.text) yield { type: 'text', chunk: chunk.text };
            const parts = (chunk as any).candidates?.[0]?.content?.parts;
            if (Array.isArray(parts)) {
                for (const part of parts) {
                    modelParts.push(part);
                    if (part.functionCall?.name) {
                        calls.push({ id: part.functionCall.id, name: part.functionCall.name, args: (part.functionCall.args || {}) as Record<string, any> });
                    }
                }
            }
        }
        yield { type: 'turn_end' };
        if (calls.length === 0) return;

        contents.push({ role: 'model', parts: modelParts });
        const responseParts: any[] = [];
        for (const c of calls) {
            yield { type: 'tool_start', name: c.name, args: c.args };
            const result = await executeAssistantTool(c.name, c.args, { settings });
            yield { type: 'tool_result', name: c.name, result };
            responseParts.push({ functionResponse: { name: c.name, response: { result } } });
        }
        contents.push({ role: 'user', parts: responseParts });
    }
    yield { type: 'text', chunk: '\n[Assistant]: tool-call limit reached for this turn.' };
    yield { type: 'turn_end' };
}

