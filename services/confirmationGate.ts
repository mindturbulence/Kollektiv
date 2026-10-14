/**
 * Spoken-confirmation gate for destructive assistant tools.
 *
 * A gated tool does not run on its first call: the call is parked and the model
 * is told to ask the user. The identical call only runs if the user said something
 * AFTER the assistant spoke, so the model cannot confirm itself by retrying.
 * Reading "yes" vs "no" stays with the model; this only proves a user turn happened.
 */

export const CONFIRM_TTL_MS = 60_000;

interface Pending {
    key: string;
    /** userTurn counter when the call was parked. */
    userTurn: number;
    /** The assistant produced output after the call was parked (i.e. it asked). */
    assistantSpoke: boolean;
    at: number;
}

let userTurn = 0;
let pending: Pending | null = null;

/** A user utterance (voice transcript fragment or typed message) arrived. */
export const noteUserUtterance = (): void => { userTurn++; };

/** The assistant produced output (spoken caption or final chat text). */
export const noteAssistantOutput = (): void => { if (pending) pending.assistantSpoke = true; };

const stable = (v: unknown): string => {
    if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
    if (v && typeof v === 'object') {
        return `{${Object.keys(v as object).sort().map(k => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`).join(',')}}`;
    }
    return JSON.stringify(v) ?? 'null';
};

/**
 * 'confirmed' when this exact call was parked earlier and the user answered since;
 * otherwise parks it (replacing any other pending call) and returns 'ask'.
 */
export const checkConfirmation = (name: string, args: Record<string, unknown>, now = Date.now()): 'confirmed' | 'ask' => {
    const key = `${name}:${stable(args)}`;
    const p = pending;
    if (p && p.key === key && p.assistantSpoke && userTurn > p.userTurn && now - p.at <= CONFIRM_TTL_MS) {
        pending = null;
        return 'confirmed';
    }
    pending = { key, userTurn, assistantSpoke: false, at: now };
    return 'ask';
};

export const resetConfirmationGate = (): void => { userTurn = 0; pending = null; };
