/**
 * Vision Loop — Goal-Driven Browser Automation
 *
 * Captures a screenshot of the current browser page, asks Gemini Vision to
 * decide the next action, executes it, and repeats until the goal is reached.
 *
 * This is designed for the TEXT chat assistant (not the Live voice session).
 * The Live assistant already has its own post-action verification frame loop
 * built into LiveAssistant (scheduleVerificationFrame).
 *
 * Usage:
 *   const loop = new VisionLoop(operator, settings, {
 *     onActivity: (text) => console.log(text),
 *     onComplete: (summary) => console.log(summary),
 *     onError: (err) => console.error(err),
 *   });
 *   await loop.run("Search for cats on Google Images");
 */

import type { BrowserOperator } from './browserOperator';
import type { LLMSettings } from '../types';
import { getGeminiClient } from './geminiService';

export type VisionAction =
    | { type: 'click'; x: number; y: number }
    | { type: 'type'; text: string }
    | { type: 'scroll'; dy: number }
    | { type: 'navigate'; url: string }
    | { type: 'done'; summary: string };

export interface VisionLoopCallbacks {
    onActivity?: (text: string) => void;
    onComplete?: (summary: string) => void;
    onError?: (error: string) => void;
}

const VISION_SYSTEM_PROMPT = `You are a browser automation agent. Your task is to complete the user's goal by looking at screenshots and issuing commands.

You will receive:
- A screenshot of the current browser page (JPEG image)
- A text description of the goal

You must respond with a JSON object containing the next action to take.

Valid actions:
1. {"action":"click","x":<number>,"y":<number>} — Click at pixel coordinates (0-1024 scaled frame). Use when you need to press a button, follow a link, or focus an input.
2. {"action":"type","text":"<string>"} — Type text into the currently focused element. Use after clicking an input field. Do NOT press Enter unless needed.
3. {"action":"scroll","dy":<number>} — Scroll the page. dy > 0 scrolls down, dy < 0 scrolls up. Range: -1.0 to 1.0.
4. {"action":"navigate","url":"<string>"} — Navigate to a URL.
5. {"action":"done","summary":"<string>"} — The goal is complete. Provide a summary of what was accomplished.

Rules:
- Only issue ONE action at a time
- After click/type/scroll/navigate, WAIT for the next screenshot before deciding the next action
- Be precise with coordinates — use the center of visible buttons/links
- If you cannot determine what to do, say {"action":"done","summary":"Could not determine next step."}
- Never act autonomously without evidence from the screenshot

Respond with ONLY the JSON object. No preamble, no explanation.`;

/**
 * Parse a Gemini response into a VisionAction.
 */
function parseAction(raw: string): VisionAction | null {
    try {
        // Strip markdown code fences if present
        let cleaned = raw.trim();
        cleaned = cleaned.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '');
        const parsed = JSON.parse(cleaned);
        switch (parsed.action) {
            case 'click':
                if (typeof parsed.x === 'number' && typeof parsed.y === 'number')
                    return { type: 'click', x: parsed.x, y: parsed.y };
                break;
            case 'type':
                if (typeof parsed.text === 'string')
                    return { type: 'type', text: parsed.text };
                break;
            case 'scroll':
                if (typeof parsed.dy === 'number')
                    return { type: 'scroll', dy: parsed.dy };
                break;
            case 'navigate':
                if (typeof parsed.url === 'string')
                    return { type: 'navigate', url: parsed.url };
                break;
            case 'done':
                return { type: 'done', summary: typeof parsed.summary === 'string' ? parsed.summary : 'Goal completed.' };
        }
    } catch {
        // Parse failure — treat as done with error
    }
    return null;
}

export class VisionLoop {
    private operator: BrowserOperator;
    private settings: LLMSettings;
    private callbacks: VisionLoopCallbacks;
    private _running = false;
    private _aborted = false;

    constructor(operator: BrowserOperator, settings: LLMSettings, callbacks: VisionLoopCallbacks = {}) {
        this.operator = operator;
        this.settings = settings;
        this.callbacks = callbacks;
    }

    get running(): boolean {
        return this._running;
    }

    /** Abort the current loop at the next opportunity. */
    abort(): void {
        this._aborted = true;
    }

    /**
     * Run the vision loop with a given goal.
     * Captures screenshots, asks Gemini for the next action, executes it,
     * and loops until done or an error occurs.
     */
    async run(goal: string): Promise<string> {
        const apiKey = this.settings.geminiApiKey || process.env.GEMINI_API_KEY;
        if (!apiKey) {
            const err = 'Vision loop requires a Gemini API key. Go to Settings > Integrations > Gemini to add one.';
            this.callbacks.onError?.(err);
            return err;
        }

        this._running = true;
        this._aborted = false;
        let stepCount = 0;
        const maxSteps = 30; // Safety limit

        while (this._running && !this._aborted && stepCount < maxSteps) {
            stepCount++;

            // 1. Capture screenshot
            let screenshot: { data: string; width: number; height: number };
            try {
                screenshot = await this.operator.captureScreenshot();
            } catch (e: any) {
                const err = `Vision loop failed to capture screenshot: ${e.message || e}. Ensure screen sharing is active (for in-app mode) or CDP is connected.`;
                this.callbacks.onError?.(err);
                this._running = false;
                return err;
            }

            // 2. Ask Gemini what to do
            const action = await this.queryGemini(screenshot.data, goal);
            if (!action) {
                const err = 'Vision loop could not parse Gemini response. Aborting.';
                this.callbacks.onError?.(err);
                this._running = false;
                return err;
            }

            if (action.type === 'done') {
                this.callbacks.onComplete?.(action.summary);
                this._running = false;
                return action.summary;
            }

            // 3. Execute the action
            const result = await this.executeAction(action);
            this.callbacks.onActivity?.(result);

            // 4. Wait for page to settle
            await new Promise(r => setTimeout(r, 1200));
        }

        if (stepCount >= maxSteps) {
            const msg = `Vision loop reached maximum of ${maxSteps} steps without completing the goal.`;
            this.callbacks.onComplete?.(msg);
            this._running = false;
            return msg;
        }

        if (this._aborted) {
            const msg = 'Vision loop was aborted by the user.';
            this.callbacks.onComplete?.(msg);
            this._running = false;
            return msg;
        }

        return 'Vision loop completed.';
    }

    private async queryGemini(screenshotBase64: string, goal: string): Promise<VisionAction | null> {
        try {
            const ai = getGeminiClient(this.settings);
            const response = await ai.models.generateContent({
                model: this.settings.llmModel || 'gemini-2.5-flash',
                contents: [{
                    parts: [
                        { text: `Goal: ${goal}\n\nLook at the screenshot and decide the next action. Respond with a JSON action object only.` },
                        {
                            inlineData: {
                                mimeType: 'image/jpeg',
                                data: screenshotBase64,
                            },
                        },
                    ],
                }],
                config: {
                    systemInstruction: VISION_SYSTEM_PROMPT,
                    maxOutputTokens: 300,
                    temperature: 0.2,
                },
            });
            const text = response.text || '';
            return parseAction(text);
        } catch (e: any) {
            console.warn('[VisionLoop] Gemini query failed:', e.message);
            return null;
        }
    }

    private async executeAction(action: VisionAction): Promise<string> {
        try {
            switch (action.type) {
                case 'click':
                    const clickResult = await this.operator.click(action.x, action.y);
                    return `Clicked at (${action.x}, ${action.y}): ${clickResult || 'ok'}`;
                case 'type':
                    const typeResult = await this.operator.type(action.text);
                    return `Typed "${action.text.slice(0, 50)}": ${typeResult || 'ok'}`;
                case 'scroll':
                    const scrollResult = await this.operator.scroll(0, action.dy);
                    return `Scrolled by ${action.dy}: ${scrollResult || 'ok'}`;
                case 'navigate':
                    const navResult = await this.operator.navigate(action.url);
                    return `Navigated to ${action.url}: ${navResult || 'ok'}`;
                case 'done':
                    return action.summary;
            }
        } catch (e: any) {
            return `Action failed: ${e.message || e}`;
        }
    }
}
