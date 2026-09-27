// ─── Kollektiv Video Editor — SRT parse/serialize ────────────────────────────
// Pure text <-> Cue conversion. Times are seconds (float) on the timeline
// clock, matching Clip.start/duration.

export interface Cue {
  start: number;
  end: number;
  text: string;
}

export interface SkippedCue {
  /** 1-based block index in the source text, for error messages. */
  block: number;
  reason: string;
}

export interface ParseSrtResult {
  cues: Cue[];
  skipped: SkippedCue[];
}

const TIMECODE_RE =
  /(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})\s*-->\s*(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})/;

function toSeconds(h: string, m: string, s: string, ms: string): number {
  // ponytail: pad/truncate to 3 digits instead of validating digit count.
  const millis = Number(ms.padEnd(3, '0').slice(0, 3));
  return Number(h) * 3600 + Number(m) * 60 + Number(s) + millis / 1000;
}

/** Tolerant SRT parser: CRLF/BOM, missing index lines, comma-or-dot millis,
 * multi-line cue text, stray blank lines. Malformed blocks are skipped and
 * reported rather than aborting the whole file. */
export function parseSrt(text: string): ParseSrtResult {
  const normalized = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const blocks = normalized.split(/\n{2,}/).map(b => b.trim()).filter(Boolean);

  const cues: Cue[] = [];
  const skipped: SkippedCue[] = [];

  blocks.forEach((block, i) => {
    const lines = block.split('\n');
    // Drop a leading bare-index line (e.g. "1") if present; the timecode
    // line is whatever matches TIMECODE_RE regardless of position.
    const timecodeIdx = lines.findIndex(l => TIMECODE_RE.test(l));
    if (timecodeIdx === -1) {
      skipped.push({ block: i + 1, reason: 'no timecode line' });
      return;
    }
    const match = TIMECODE_RE.exec(lines[timecodeIdx]);
    if (!match) {
      skipped.push({ block: i + 1, reason: 'malformed timecode' });
      return;
    }
    const [, h1, m1, s1, ms1, h2, m2, s2, ms2] = match;
    const start = toSeconds(h1, m1, s1, ms1);
    const end = toSeconds(h2, m2, s2, ms2);
    if (!(end > start)) {
      skipped.push({ block: i + 1, reason: 'end <= start' });
      return;
    }
    const cueText = lines.slice(timecodeIdx + 1).join('\n').trim();
    if (!cueText) {
      skipped.push({ block: i + 1, reason: 'empty text' });
      return;
    }
    cues.push({ start, end, text: cueText });
  });

  return { cues, skipped };
}

function formatTimestamp(seconds: number): string {
  const totalMs = Math.max(0, Math.round(seconds * 1000));
  const ms = totalMs % 1000;
  const totalSec = Math.floor(totalMs / 1000);
  const s = totalSec % 60;
  const m = Math.floor(totalSec / 60) % 60;
  const h = Math.floor(totalSec / 3600);
  const pad = (n: number, len = 2) => String(n).padStart(len, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms, 3)}`;
}

/** LF-only output (no CRLF); most players and diff tools accept it. */
export function serializeSrt(cues: Cue[]): string {
  return cues
    .map((cue, i) => {
      // A blank line inside cue text would look like a block separator to
      // parseSrt on re-read, so collapse any run of blank lines to one.
      const text = cue.text.replace(/\n{2,}/g, '\n');
      return `${i + 1}\n${formatTimestamp(cue.start)} --> ${formatTimestamp(cue.end)}\n${text}`;
    })
    .join('\n\n') + (cues.length ? '\n' : '');
}
