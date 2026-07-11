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

// Per-page function reference so the assistant can accurately answer "can you do X"
// and pick the right tool, instead of guessing or staying silent on UI-only features.
// Keep in sync with services/assistantTools.ts and Plan-ai-assistant.md's tool list.
const WORKSPACE_CAPABILITIES = `Workspace pages and what's on them. Call the named tool when asked; for "UI-only" items there is no tool — tell the user which button to click instead of guessing or pretending to do it.
- Refiner: Improve = refine_prompt, Rewrite = rewrite_prompt, Translate = translate_prompt, Save as Preset = save_refiner_preset, load text here = send_to_refiner. UI-only: Reset, Export Code, JSON export/download, Arena mode (dual-model compare), direct Render via Imagen/Veo/NanoBanana.
- Crafter: Generate (resolve wildcards + AI polish) = generate_crafter_prompt, list real wildcard names = list_wildcards, Translate = translate_prompt, Rewrite/Reconstruct = rewrite_prompt, Clip to Clipped Ideas = clip_idea, load text here = send_to_crafter. UI-only: Save Result (local scratch list), Save/Apply/Delete Template, Import wildcard file (touches disk).
- Prompt Analyzer: Analyze/dissect a prompt = analyze_prompt, load text here = send_to_prompt_analyzer. UI-only: Map to Refiner (approximate it by chaining analyze_prompt then send_to_refiner), select from library.
- Abstractor (Media Analyzer): reverse-engineer a prompt from an image the user attached to the chat = abstract_image (fails if no image is attached — it cannot read files off disk, only chat attachments). UI-only: Read Metadata (needs the original file, not available from chat), Save Workflow, Copy Raw.
Elsewhere: search/save the prompt library = search_prompts/save_prompt, search the gallery = search_gallery, search cheatsheets = search_cheatsheets, navigate the app = navigate, browse discovery collections = list_discovery_collections/search_discovery_prompts.`;

/** Builds the assistant's system prompt from the configured persona
 * (Settings > Integrations > Assistant). Used by every provider path,
 * text and live voice alike, so persona stays consistent everywhere.
 *
 * Master Role Concept (Settings > AI Engine) is the app-wide directive already
 * injected into every other LLM call (refine/enhance/reconstruct — see
 * llmService.ts's masterRolePrompt handling); it was never reaching the
 * assistant's own identity, so its "applied to every LLM request" description
 * was false for the one place users talk to the AI directly. Prepending it
 * here, same convention as llmService.ts (prepend, blank-line separated). */
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
    const identity = lines.join(' ');
    const withMasterRole = settings.masterRolePrompt?.trim()
        ? `${settings.masterRolePrompt.trim()}\n\n${identity}`
        : identity;
    return `${withMasterRole}\n\n${WORKSPACE_CAPABILITIES}`;
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
    // Attachments on the most recent user turn, made available to tools like abstract_image.
    const attachments = [...messages].reverse().find(m => m.role === 'user' && m.attachments?.length)?.attachments;
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
            const result = await executeAssistantTool(c.name, c.args, { settings, attachments });
            yield { type: 'tool_result', name: c.name, result };
            responseParts.push({ functionResponse: { name: c.name, response: { result } } });
        }
        contents.push({ role: 'user', parts: responseParts });
    }
    yield { type: 'text', chunk: '\n[Assistant]: tool-call limit reached for this turn.' };
    yield { type: 'turn_end' };
}

