import { parseShotScript, replaceBeat, serializeShotScript } from './shotScript';

export type Complete = (system: string, user: string) => Promise<string>;

const SYSTEM = `You rewrite ONE beat of a video shot script.
You are given the whole script for context and the number of the beat to rewrite.
Output only the rewritten beat text: one to three sentences, same tense and point of view, concrete physically plausible motion, keeping every character, outfit and setting detail the neighbouring beats rely on.
No timestamp, no label, no numbering, no quotes around it, no explanation. Keep any spoken line unless the instruction changes it.`;

/** The system and user messages for rewriting beat `index` of `script`. */
export const buildBeatPrompt = (script: string, index: number, instruction = ''): { system: string; user: string } => {
  const s = parseShotScript(script);
  const beat = s.beats[index];
  const around = (i: number) => (s.beats[i] ? s.beats[i].text : '(none)');
  const user = [
    `Full script:\n${script}`,
    `Previous beat: ${around(index - 1)}`,
    `Beat ${index + 1} to rewrite: ${beat ? beat.text : ''}`,
    `Next beat: ${around(index + 1)}`,
    instruction.trim() ? `Instruction: ${instruction.trim()}` : 'Instruction: improve it while keeping its meaning.',
  ].join('\n\n');
  return { system: SYSTEM, user };
};

const LABEL = /^\s*(?:beat\s*\d+|\d+\s*[–-]\s*\d+\s*s)\s*[:.\-–]\s*/i;

const cleanBeat = (raw: string): string => raw
  .replace(/```[a-z]*\n?|```/gi, '')
  .split('\n').map(l => l.trim()).filter(Boolean).join(' ')
  .replace(/^["“”]+|["“”]+$/g, '')
  .replace(LABEL, '')
  .trim();

/** Rewrites one beat through `complete` and returns the whole script with only that beat replaced. */
export const refineBeat = async (script: string, index: number, instruction: string, complete: Complete): Promise<string> => {
  const parsed = parseShotScript(script);
  if (!Number.isInteger(index) || index < 0 || index >= parsed.beats.length) throw new Error(`No beat ${index + 1} in this script.`);
  const { system, user } = buildBeatPrompt(script, index, instruction);
  const text = cleanBeat(await complete(system, user));
  if (!text) throw new Error('The model returned an empty beat.');
  return serializeShotScript(replaceBeat(parsed, index, text));
};
