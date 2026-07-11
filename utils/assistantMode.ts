export type AssistantMode = 'connecting' | 'command' | 'listening' | 'processing' | 'responding';

const ACTIVITY_HOLD_MS = 3_000;
const LISTENING_HOLD_MS = 2_000;

/** Maps live-session signals to the Samaritan screen's visual mode.
 * Pure so the precedence rules are unit-testable without React. */
export function deriveMode(input: {
    status: 'idle' | 'connecting' | 'live' | 'error';
    speaking: boolean;
    lastActivityAt: number;
    lastUserCaptionAt: number;
    now: number;
}): AssistantMode {
    if (input.status === 'connecting') return 'connecting';
    if (input.speaking) return 'responding';
    if (input.now - input.lastActivityAt < ACTIVITY_HOLD_MS) return 'processing';
    if (input.now - input.lastUserCaptionAt < LISTENING_HOLD_MS) return 'listening';
    return 'command';
}
