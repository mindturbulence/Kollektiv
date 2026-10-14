import { describe, it, expect, beforeEach, vi } from 'vitest';

const store = new Map<string, unknown>();
vi.mock('../utils/db', () => ({
    getHandle: async (k: string) => store.get(k),
    setHandle: async (k: string, v: unknown) => { store.set(k, v); },
}));

import { fireDueReminders } from './reminderService';
import { addReminder, loadReminders, pendingReminders, cancelReminder } from '../utils/remindersStorage';
import { appEventBus } from '../utils/eventBus';

describe('reminders', () => {
    const toasts: string[] = [];
    beforeEach(() => {
        store.clear();
        toasts.length = 0;
        appEventBus.on('assistantFeedback', (f: { message: string }) => { toasts.push(f.message); });
    });

    it('fires a due reminder once and not a future one', async () => {
        const now = Date.now();
        await addReminder('stretch', now - 1_000);
        await addReminder('later', now + 3_600_000);
        expect(await fireDueReminders(now)).toBe(1);
        expect(toasts).toEqual(['Reminder: stretch']);
        expect(await fireDueReminders(now)).toBe(0);
        expect(pendingReminders(await loadReminders()).map(r => r.text)).toEqual(['later']);
    });

    it('labels a reminder that came due long ago as missed', async () => {
        const now = Date.now();
        await addReminder('call mum', now - 3_600_000);
        await fireDueReminders(now);
        expect(toasts[0]).toMatch(/^Missed reminder \(was due .+\): call mum$/);
    });

    it('cancels by id', async () => {
        const r = await addReminder('x', Date.now() + 60_000);
        expect(await cancelReminder(r.id)).toBe(true);
        expect(await cancelReminder(r.id)).toBe(false);
    });
});
