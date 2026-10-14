import { v4 as uuidv4 } from 'uuid';
import { getHandle, setHandle } from './db';

export interface Reminder {
  id: string;
  text: string;
  /** Epoch ms when it should fire. */
  dueAt: number;
  createdAt: number;
  /** Set once the toast was shown; fired reminders are pruned after a day. */
  firedAt?: number;
}

const KEY = 'assistantReminders';
const KEEP_FIRED_MS = 24 * 60 * 60 * 1000;

export async function loadReminders(): Promise<Reminder[]> {
  try {
    return (await getHandle<Reminder[]>(KEY)) ?? [];
  } catch {
    return [];
  }
}

const save = (list: Reminder[]): Promise<void> => setHandle(KEY, list);

export async function addReminder(text: string, dueAt: number): Promise<Reminder> {
  const r: Reminder = { id: uuidv4(), text, dueAt, createdAt: Date.now() };
  await save([...(await loadReminders()), r]);
  return r;
}

export async function cancelReminder(id: string): Promise<boolean> {
  const list = await loadReminders();
  const next = list.filter(r => r.id !== id);
  if (next.length === list.length) return false;
  await save(next);
  return true;
}

/** Marks reminders as fired and prunes ones fired more than a day ago. */
export async function markFired(ids: string[], now = Date.now()): Promise<void> {
  const list = await loadReminders();
  await save(
    list
      .map(r => (ids.includes(r.id) ? { ...r, firedAt: now } : r))
      .filter(r => r.firedAt == null || now - r.firedAt < KEEP_FIRED_MS),
  );
}

export const pendingReminders = (list: Reminder[]): Reminder[] =>
  list.filter(r => r.firedAt == null).sort((a, b) => a.dueAt - b.dueAt);
