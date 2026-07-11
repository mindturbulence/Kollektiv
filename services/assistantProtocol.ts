/** Helpers for the <action> tool protocol used by assistant brains without
 * native function calling in our client (anthropic, llamacpp — see
 * assistantTools.fallbackProtocolPrompt for the matching system prompt). */

export interface ActionCall {
    tool: string;
    args: Record<string, any>;
}

const ACTION_RE = /<action>\s*(\{[\s\S]*?\})\s*<\/action>/;

/** Extract the first <action>{"tool":.., "args":..}</action> block, if any. */
export const parseActionBlock = (text: string): ActionCall | null => {
    const m = text.match(ACTION_RE);
    if (!m) return null;
    try {
        const parsed = JSON.parse(m[1]);
        if (typeof parsed.tool !== 'string' || !parsed.tool) return null;
        return { tool: parsed.tool, args: parsed.args && typeof parsed.args === 'object' ? parsed.args : {} };
    } catch {
        return null;
    }
};

/** Portion of a (possibly still streaming) reply safe to show the user:
 * everything before the action block, also holding back a trailing partial
 * "<action>" prefix so the tag never flashes on screen mid-stream. */
export const visibleText = (text: string): string => {
    const idx = text.indexOf('<action>');
    if (idx !== -1) return text.slice(0, idx);
    const TAG = '<action>';
    for (let k = Math.min(TAG.length - 1, text.length); k > 0; k--) {
        if (text.endsWith(TAG.slice(0, k))) return text.slice(0, text.length - k);
    }
    return text;
};
