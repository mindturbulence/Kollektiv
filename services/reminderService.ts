import { appEventBus } from '../utils/eventBus';
import { loadReminders, markFired, pendingReminders } from '../utils/remindersStorage';

const TICK_MS = 30_000;

const clock = (ms: number): string =>
    new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

/**
 * Shows a toast for every reminder that is due. Reminders only fire while the app
 * is open; one that came due while it was closed shows up here on the next boot,
 * labelled as missed.
 */
export async function fireDueReminders(now = Date.now()): Promise<number> {
    const due = pendingReminders(await loadReminders()).filter(r => r.dueAt <= now);
    if (due.length === 0) return 0;
    await markFired(due.map(r => r.id), now);
    for (const r of due) {
        const missed = now - r.dueAt > 2 * TICK_MS;
        appEventBus.emit('assistantFeedback', {
            message: missed ? `Missed reminder (was due ${clock(r.dueAt)}): ${r.text}` : `Reminder: ${r.text}`,
            isError: false,
        });
    }
    return due.length;
}

/** Checks now (catches up on missed ones) and then every 30 s. Returns the stop function. */
export function startReminderTicker(): () => void {
    void fireDueReminders();
    const t = setInterval(() => { void fireDueReminders(); }, TICK_MS);
    return () => clearInterval(t);
}
