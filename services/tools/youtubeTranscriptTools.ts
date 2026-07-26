import type { AssistantTool } from './types';
import type { WebResult } from '../../types';
import { appEventBus } from '../../utils/eventBus';

/** Accepts a bare video ID or a full YouTube URL and returns just the ID. */
export function extractVideoId(input: string): string {
  const trimmed = input.trim();
  const urlMatch = trimmed.match(/(?:v=|youtu\.be\/|\/embed\/|\/shorts\/)([a-zA-Z0-9_-]{11})/);
  if (urlMatch) return urlMatch[1];
  return trimmed;
}

export const youtubeTranscriptTools: AssistantTool[] = [
  {
    name: 'youtube_get_transcript',
    description: 'Fetch the transcript/captions of a YouTube video, if available. Complements youtube_search (which finds videos but cannot read their content). Accepts a bare video ID or a full URL. This channel is not fully reliable — YouTube can change or block access without notice — so expect occasional failures with a clear error rather than a crash.',
    parameters: {
      type: 'object',
      properties: {
        videoId: { type: 'string', description: 'YouTube video ID or full video URL.' },
        lang: { type: 'string', description: 'Preferred caption language code, e.g. "en". Falls back to any available track if not found.' },
      },
      required: ['videoId'],
    },
    execute: async ({ videoId, lang }) => {
      try {
        const id = extractVideoId(String(videoId));
        const res = await fetch('/api/reach/youtube-transcript', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ videoId: id, lang: lang ? String(lang) : undefined }),
        });
        const data = await res.json();
        if (!res.ok) {
          return `Error: transcript unavailable for this video (captions disabled, or fetch blocked). Try scrape_url on the video page instead. (${data?.error || 'unknown error'})`;
        }
        const text = (data.segments || []).map((s: any) => s.text).join(' ');
        appEventBus.emit('webSearchResults', [{
          title: `YouTube transcript: ${id}`,
          url: `https://www.youtube.com/watch?v=${id}`,
          markdown: text,
          source: 'fetch',
          engine: 'youtube',
          timestamp: Date.now(),
        } as WebResult]);
        return text || 'Transcript was empty.';
      } catch (e: any) {
        return `Error: transcript unavailable for this video (captions disabled, or fetch blocked). Try scrape_url on the video page instead. (${e?.message || e})`;
      }
    },
  },
];
