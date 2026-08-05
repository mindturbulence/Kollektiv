/**
 * Story Asset Extractor — WP9 of the Adaptation Roadmap.
 *
 * Extracts structured cast and locations from Fountain-formatted scripts.
 *
 * Two artifacts per entity:
 * 1. A RefinerPreset with kind: 'character' | 'world', pre-filled modifiers
 * 2. An Obsidian note under knowledge/projects/ with frontmatter and [[wikilinks]]
 *    to the other entities that share a scene with it.
 */

import type { AssistantTool } from './types';
import { HAIR_STYLES, EYE_COLORS, CLOTHING_STYLES } from '../../constants/modifiers';
import { PROMPT_DETAIL_LEVELS } from '../../constants/modifiers';
import { TARGET_IMAGE_AI_MODELS } from '../../constants/models';
import type { PromptModifiers } from '../../types';

// ── Fountain Parser ────────────────────────────────────────────────────

const SCENE_HEADING_RE = /^(INT\.|EXT\.|EST\.|INT\/EXT\.)/;
const CHARACTER_CUE_RE = /^[A-Z][A-Z0-9 .'-]{1,30}$/;

/**
 * Fountain transitions and slugs that read as ALL-CAPS lines but are not
 * character cues. Not exhaustive — the occurrence-count gate below is the
 * real defense against false positives, this just removes the obvious ones.
 */
const NON_CHARACTER_SLUGS = new Set([
  'FADE IN', 'FADE OUT', 'FADE TO BLACK', 'CUT TO', 'SMASH CUT TO', 'MATCH CUT TO',
  'DISSOLVE TO', 'CONTINUOUS', 'LATER', 'MOMENTS LATER', 'INTERCUT', 'MONTAGE',
  'END MONTAGE', 'END OF MONTAGE', 'TITLE CARD', 'SUPER', 'BACK TO SCENE', 'THE END',
]);
const NON_CHARACTER_PREFIX_RE = /^(THE |A |AN |AND |OR |BUT |FADE |CUT |DISSOLVE |SUPER |TITLE )/;
/** Minimum times a name must appear as a standalone cue line to count as a real character. */
const MIN_CUE_OCCURRENCES = 2;

/** Detect if text is Fountain format (has scene headings or character cues). */
function isFountain(text: string): boolean {
  const lines = text.split('\n');
  let hasSceneHeading = false;
  let hasCharacter = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (SCENE_HEADING_RE.test(trimmed)) hasSceneHeading = true;
    if (isCandidateCueLine(trimmed)) hasCharacter = true;
    if (hasSceneHeading && hasCharacter) return true;
  }
  return false;
}

function isCandidateCueLine(trimmed: string): boolean {
  if (!CHARACTER_CUE_RE.test(trimmed)) return false;
  if (SCENE_HEADING_RE.test(trimmed)) return false;
  if (NON_CHARACTER_SLUGS.has(trimmed)) return false;
  if (NON_CHARACTER_PREFIX_RE.test(trimmed)) return false;
  if (trimmed.endsWith(':') || trimmed.endsWith(' TO')) return false;
  return true;
}

interface ExtractionResult {
  /** Characters that appeared often enough to be trusted. */
  characters: string[];
  /** Candidate lines that looked like cues but didn't clear the confidence bar. */
  rejectedCandidates: string[];
  /** Scene headings each accepted character appears under. */
  characterScenes: Map<string, string[]>;
  scenes: Array<{ heading: string; location: string }>;
}

/**
 * Single pass: tracks the current scene heading and attributes each
 * character cue to it, and counts cue occurrences to gate false positives
 * (Fountain slugs like MONTAGE/SUPER: read as ALL-CAPS lines too).
 */
function extractFountain(text: string): ExtractionResult {
  const lines = text.split('\n');
  const counts = new Map<string, number>();
  const scenesByChar = new Map<string, Set<string>>();
  const scenes: Array<{ heading: string; location: string }> = [];
  let currentHeading: string | null = null;

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    const sceneMatch = trimmed.match(/^(INT\.|EXT\.|EST\.|INT\/EXT\.)\s*(.+)/i);
    if (sceneMatch) {
      currentHeading = trimmed;
      scenes.push({ heading: trimmed, location: sceneMatch[2].trim() });
      continue;
    }
    if (isCandidateCueLine(trimmed)) {
      counts.set(trimmed, (counts.get(trimmed) || 0) + 1);
      if (currentHeading) {
        if (!scenesByChar.has(trimmed)) scenesByChar.set(trimmed, new Set());
        scenesByChar.get(trimmed)!.add(currentHeading);
      }
    }
  }

  const characters: string[] = [];
  const rejectedCandidates: string[] = [];
  for (const [name, count] of counts) {
    if (count >= MIN_CUE_OCCURRENCES) characters.push(name);
    else rejectedCandidates.push(name);
  }

  const characterScenes = new Map<string, string[]>();
  for (const name of characters) {
    characterScenes.set(name, Array.from(scenesByChar.get(name) || []));
  }

  return { characters, rejectedCandidates, characterScenes, scenes };
}

// ── Location deduplication ─────────────────────────────────────────────

function dedupeLocations(scenes: Array<{ heading: string; location: string }>): Array<{ name: string; scenes: string[] }> {
  const locationMap = new Map<string, string[]>();
  for (const s of scenes) {
    // Normalize: strip time-of-day suffixes like " - DAY", " - NIGHT"
    const normalized = s.location.replace(/\s*[-–]\s*(DAY|NIGHT|EVENING|MORNING|DUSK|DAWN|CONTINUOUS|LATER|MOMENTS LATER)$/i, '').trim();
    const existing = locationMap.get(normalized) || [];
    existing.push(s.heading);
    locationMap.set(normalized, existing);
  }
  return Array.from(locationMap.entries()).map(([name, scenes]) => ({ name, scenes }));
}

/** Map a scene heading back to its deduped location name. */
function headingToLocationName(heading: string, locations: Array<{ name: string; scenes: string[] }>): string | undefined {
  return locations.find(l => l.scenes.includes(heading))?.name;
}

// ── Asset creation ─────────────────────────────────────────────────────

function wikilinkList(names: string[]): string {
  return names.length ? names.map(n => `- [[${n.replace(/[[\]]/g, '')}]]`).join('\n') : '- (none found)';
}

function buildCharacterNote(name: string, locationNames: string[], sceneHeadings: string[]): string {
  return `---
title: "${name}"
kind: character
lifecycle_stage: projects
autoAccept: true
tags: ["character", "story-asset"]
---

# ${name}

## Appears In
${wikilinkList(locationNames)}

## Scenes
${sceneHeadings.map(s => `- ${s}`).join('\n') || '- (none found)'}

## Visual Notes
-
`;
}

function buildLocationNote(name: string, characterNames: string[], sceneHeadings: string[]): string {
  return `---
title: "${name}"
kind: location
lifecycle_stage: projects
autoAccept: true
tags: ["location", "story-asset"]
---

# ${name}

## Characters Present
${wikilinkList(characterNames)}

## Scenes
${sceneHeadings.map(s => `- ${s}`).join('\n') || '- (none found)'}

## Visual Notes
-
`;
}

/** Seed modifiers with the first vocabulary entry — a valid, non-empty
 *  placeholder so the preset is immediately generatable, not an inferred trait. */
function seedCharacterModifiers(): Partial<PromptModifiers> {
  return {
    hairStyle: HAIR_STYLES[0],
    eyeColor: EYE_COLORS[0],
    clothing: CLOTHING_STYLES[0],
  } as Partial<PromptModifiers>;
}

// ── Tool definition ────────────────────────────────────────────────────

export const extractStoryAssetsTool: AssistantTool = {
  name: 'extract_story_assets',
  description:
    'Extract structured cast (characters) and locations from a Fountain-formatted script ' +
    '(INT./EXT. scene headings, ALL-CAPS character cues repeated 2+ times). ' +
    'Creates a RefinerPreset and an Obsidian note under knowledge/projects/ for each character/location, ' +
    'cross-linked with [[wikilinks]]. Non-Fountain text is not parsed — this tool does not do free-form ' +
    'entity extraction from arbitrary prose.',
  parameters: {
    type: 'object',
    properties: {
      text: {
        type: 'string',
        description: 'The Fountain script text to extract from. Provide either text or vaultPath.',
      },
      vaultPath: {
        type: 'string',
        description: 'Path to a script file in the vault. The file will be read and parsed.',
      },
    },
  },
  execute: async (args) => {
    const text = args.text as string | undefined;
    const vaultPath = args.vaultPath as string | undefined;

    if (!text && !vaultPath) {
      return 'Error: Provide either text or vaultPath.';
    }

    let scriptText = text || '';
    if (vaultPath && !text) {
      try {
        const { getNote } = await import('../../utils/obsidianStorage');
        const note = await getNote(vaultPath);
        if (!note) return `Error: Could not read file at ${vaultPath}`;
        scriptText = note.content;
      } catch (e) {
        return `Error reading vault file: ${e}`;
      }
    }

    if (!isFountain(scriptText)) {
      return 'No Fountain-formatted content detected (need INT./EXT. scene headings plus repeated ALL-CAPS character cues). This tool only parses Fountain scripts — nothing was extracted or written.';
    }

    const { characters, rejectedCandidates, characterScenes, scenes } = extractFountain(scriptText);
    const locations = dedupeLocations(scenes);

    if (characters.length === 0 && locations.length === 0) {
      return 'Fountain structure detected, but no character cue cleared the confidence bar (2+ occurrences) and no scene headings were found. Nothing was written — lower confidence is reported instead of guessing.';
    }

    // Character → locations they appear in (for cross-linking).
    const characterLocations = new Map<string, string[]>();
    for (const name of characters) {
      const headings = characterScenes.get(name) || [];
      const locNames = Array.from(new Set(headings.map(h => headingToLocationName(h, locations)).filter((n): n is string => !!n)));
      characterLocations.set(name, locNames);
    }
    // Location → characters present (inverse of the above).
    const locationCharacters = new Map<string, string[]>();
    for (const loc of locations) {
      const chars = characters.filter(c => (characterScenes.get(c) || []).some(h => loc.scenes.includes(h)));
      locationCharacters.set(loc.name, chars);
    }

    const { writeNote, isObsidianConnected } = await import('../../utils/obsidianStorage');
    const { knowledgeLifecycle } = await import('../knowledgeLifecycle');
    const { refinerPresetService } = await import('../refinerPresetService');

    if (!isObsidianConnected()) {
      return 'Vault not connected. Connect an Obsidian vault first.';
    }

    let notesWritten = 0;
    let presetsCreated = 0;

    // Character notes + presets
    for (const char of characters) {
      const sceneHeadings = characterScenes.get(char) || [];
      const noteContent = buildCharacterNote(char, characterLocations.get(char) || [], sceneHeadings);
      const stage = knowledgeLifecycle.determineStage('vault_note', 'knowledge', ['character', 'story-asset']);
      const path = knowledgeLifecycle.generatePath(stage, 'vault_note', `character_${char.toLowerCase().replace(/\s+/g, '_')}`, char);

      try {
        await writeNote(path, noteContent);
        notesWritten++;
      } catch { /* non-fatal */ }

      try {
        await refinerPresetService.savePreset({
          name: char,
          modifiers: seedCharacterModifiers() as PromptModifiers,
          targetAIModel: TARGET_IMAGE_AI_MODELS[0],
          mediaMode: 'image',
          promptLength: PROMPT_DETAIL_LEVELS.MEDIUM,
          kind: 'character',
          tags: ['story-asset', 'character'],
          freeform: `Extracted from script. Appears in ${sceneHeadings.length} scene(s): ${sceneHeadings.join(', ') || 'none'}.`,
          useCount: 0,
        });
        presetsCreated++;
      } catch { /* non-fatal — note still written */ }
    }

    // Location notes + presets
    for (const loc of locations) {
      const noteContent = buildLocationNote(loc.name, locationCharacters.get(loc.name) || [], loc.scenes);
      const stage = knowledgeLifecycle.determineStage('vault_note', 'knowledge', ['location', 'story-asset']);
      const path = knowledgeLifecycle.generatePath(stage, 'vault_note', `location_${loc.name.toLowerCase().replace(/\s+/g, '_')}`, loc.name);

      try {
        await writeNote(path, noteContent);
        notesWritten++;
      } catch { /* non-fatal */ }

      try {
        await refinerPresetService.savePreset({
          name: loc.name,
          modifiers: {} as PromptModifiers,
          targetAIModel: TARGET_IMAGE_AI_MODELS[0],
          mediaMode: 'image',
          promptLength: PROMPT_DETAIL_LEVELS.MEDIUM,
          kind: 'world',
          tags: ['story-asset', 'location'],
          freeform: `Extracted from script. ${loc.scenes.length} scene(s): ${loc.scenes.join(', ')}.`,
          useCount: 0,
        });
        presetsCreated++;
      } catch { /* non-fatal — note still written */ }
    }

    // Summary — degrade visibly: report what was rejected, not just what was kept.
    const summary = [
      '**Extracted from Fountain script:**',
      '',
      `**Characters (${characters.length}):** ${characters.join(', ') || 'none detected'}`,
      `**Locations (${locations.length}):** ${locations.map(l => l.name).join(', ') || 'none detected'}`,
      rejectedCandidates.length
        ? `**Low-confidence candidates skipped (${rejectedCandidates.length}):** ${rejectedCandidates.join(', ')} — appeared fewer than ${MIN_CUE_OCCURRENCES} times as a cue line, likely a transition/slug rather than a character.`
        : '',
      '',
      `**${notesWritten} notes** written to vault under knowledge/projects/, **${presetsCreated} RefinerPresets** created.`,
    ].filter(Boolean);

    return summary.join('\n');
  },
};
