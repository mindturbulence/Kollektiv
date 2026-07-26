import { describe, it, expect } from 'vitest';
import { extractCaptionTracksFromPlayerResponse } from './innertube';

const FIXTURE_PLAYER_RESPONSE = {
  videoDetails: { videoId: 'abc123' },
  captions: {
    playerCaptionsTracklistRenderer: {
      captionTracks: [
        { baseUrl: 'https://www.youtube.com/api/timedtext?v=abc123&lang=en', languageCode: 'en' },
      ],
    },
  },
};

describe('extractCaptionTracksFromPlayerResponse', () => {
  it('extracts caption tracks from an InnerTube player response', () => {
    const tracks = extractCaptionTracksFromPlayerResponse(FIXTURE_PLAYER_RESPONSE);
    expect(tracks).toEqual([{ baseUrl: 'https://www.youtube.com/api/timedtext?v=abc123&lang=en', languageCode: 'en', kind: undefined }]);
  });

  it('returns an empty array when captions are absent', () => {
    expect(extractCaptionTracksFromPlayerResponse({ videoDetails: {} })).toEqual([]);
  });

  it('returns an empty array for a malformed response', () => {
    expect(extractCaptionTracksFromPlayerResponse(null)).toEqual([]);
    expect(extractCaptionTracksFromPlayerResponse(undefined)).toEqual([]);
  });
});
