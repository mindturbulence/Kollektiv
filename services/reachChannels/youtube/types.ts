export interface TranscriptSegment {
  text: string;
  start: number;
  duration: number;
}

export interface CaptionTrack {
  baseUrl: string;
  languageCode: string;
  kind?: string; // 'asr' for auto-generated
}

/** One backend for fetching a YouTube video's transcript, tried in order until one succeeds. */
export interface TranscriptBackend {
  readonly name: string;
  fetch(videoId: string, lang?: string): Promise<TranscriptSegment[]>;
}
