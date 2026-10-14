import { beatLabel } from './videoDirector';

export type ScriptBeat = { start: number | null; end: number | null; text: string };
export type ShotScript = {
  dialect: 'timestamps' | 'blocks' | 'paragraphs';
  /** Opening format line (timestamps only), else ''. */
  header: string;
  /** Text before the beats: subject lock / world, or the blocks scene + Cinematography + Mood lines. */
  lead: string;
  beats: ScriptBeat[];
  /** Lines after the beats (Visual Style / Audio / Important, or Dialogue / Background Sound). */
  tail: string[];
};

const RANGE = /^\s*(\d+)\s*[–-]\s*(\d+)\s*s\s*[:.\-–]\s*(.*)$/;
const TAIL_LABEL = /^\s*(visual style|audio|important)\s*:/i;
const ACTIONS = /^\s*actions\s*:\s*$/i;
const BULLET = /^\s*[-•*]\s+(.*)$/;
const HEADER = /total duration/i;

const parseTimestamps = (lines: string[]): ShotScript => {
  const first = lines.findIndex(l => RANGE.test(l));
  let header = '';
  let leadLines = lines.slice(0, first);
  if (leadLines.length && HEADER.test(leadLines[0])) {
    header = leadLines[0].trim();
    leadLines = leadLines.slice(1);
  }
  const beats: ScriptBeat[] = [];
  const tail: string[] = [];
  let inTail = false;
  let blankSeen = false;
  for (const line of lines.slice(first)) {
    const t = line.trim();
    if (!t) { blankSeen = true; continue; }
    const m = RANGE.exec(line);
    if (!inTail && m) {
      beats.push({ start: Number(m[1]), end: Number(m[2]), text: m[3].trim() });
      blankSeen = false;
    } else if (inTail || blankSeen || TAIL_LABEL.test(line)) {
      inTail = true;
      tail.push(t);
    } else {
      beats[beats.length - 1].text += `\n${t}`;
    }
  }
  return { dialect: 'timestamps', header, lead: leadLines.join('\n').trim(), beats, tail };
};

const parseBlocks = (lines: string[]): ShotScript => {
  const at = lines.findIndex(l => ACTIONS.test(l));
  const beats: ScriptBeat[] = [];
  const tail: string[] = [];
  for (const line of lines.slice(at + 1)) {
    const t = line.trim();
    if (!t) continue;
    const m = BULLET.exec(line);
    if (!tail.length && m) beats.push({ start: null, end: null, text: m[1].trim() });
    else tail.push(t);
  }
  return { dialect: 'blocks', header: '', lead: lines.slice(0, at).join('\n').trim(), beats, tail };
};

/** Auto-detects the dialect from the text; never throws. Unstructured text becomes paragraph beats. */
export const parseShotScript = (text: string): ShotScript => {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  if (lines.some(l => RANGE.test(l))) return parseTimestamps(lines);
  if (lines.some(l => ACTIONS.test(l))) return parseBlocks(lines);
  const beats = text.replace(/\r\n?/g, '\n').split(/\n\s*\n/).map(p => p.trim()).filter(Boolean)
    .map((p): ScriptBeat => ({ start: null, end: null, text: p }));
  return { dialect: 'paragraphs', header: '', lead: '', beats, tail: [] };
};

/** Canonical text: header, lead, beats, tail; blank line between sections (none between header and beats). */
export const serializeShotScript = (s: ShotScript): string => {
  const tail = s.tail.join('\n');
  if (s.dialect === 'paragraphs') return s.beats.map(b => b.text).join('\n\n');
  if (s.dialect === 'blocks') {
    const bullets = ['Actions:', ...s.beats.map(b => `- ${b.text}`)].join('\n');
    return [s.lead, bullets, tail].filter(Boolean).join('\n\n');
  }
  const beats = s.beats
    .map(b => (b.start !== null && b.end !== null ? `${beatLabel({ start: b.start, end: b.end })}: ${b.text}` : b.text))
    .join('\n');
  const top = s.lead ? `${s.header ? `${s.header}\n` : ''}${s.lead}\n\n${beats}` : [s.header, beats].filter(Boolean).join('\n');
  return [top, tail].filter(Boolean).join('\n\n');
};

/** New script with beat `index` text replaced; out-of-range returns `s` itself. */
export const replaceBeat = (s: ShotScript, index: number, text: string): ShotScript => {
  if (!Number.isInteger(index) || index < 0 || index >= s.beats.length) return s;
  return { ...s, beats: s.beats.map((b, i) => (i === index ? { ...b, text } : b)) };
};

/** Seconds covered by a timestamped script (header's Total duration, else last beat end); null otherwise. */
export const scriptDuration = (s: ShotScript): number | null => {
  if (s.dialect !== 'timestamps') return null;
  const m = /total duration\s+(\d+(?:\.\d+)?)\s*s/i.exec(s.header);
  if (m) return Number(m[1]);
  return s.beats.length ? s.beats[s.beats.length - 1].end : null;
};
