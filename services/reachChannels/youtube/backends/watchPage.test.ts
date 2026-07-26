import { describe, it, expect } from 'vitest';
import { extractCaptionTracks } from './watchPage';

const FIXTURE_HTML = `
<html><body>
<script>
var ytInitialPlayerResponse = {"videoDetails":{"videoId":"abc123"},"captions":{"playerCaptionsTracklistRenderer":{"captionTracks":[{"baseUrl":"https://www.youtube.com/api/timedtext?v=abc123&lang=en","languageCode":"en"},{"baseUrl":"https://www.youtube.com/api/timedtext?v=abc123&lang=en&kind=asr","languageCode":"en","kind":"asr"}]}}};
var ytInitialData = {};
</script>
</body></html>
`;

describe('extractCaptionTracks', () => {
  it('extracts caption tracks from an embedded ytInitialPlayerResponse blob', () => {
    const tracks = extractCaptionTracks(FIXTURE_HTML);
    expect(tracks).toHaveLength(2);
    expect(tracks[0]).toEqual({ baseUrl: 'https://www.youtube.com/api/timedtext?v=abc123&lang=en', languageCode: 'en', kind: undefined });
    expect(tracks[1].kind).toBe('asr');
  });

  it('returns an empty array when no player response is found', () => {
    expect(extractCaptionTracks('<html><body>nothing here</body></html>')).toEqual([]);
  });

  it('returns an empty array when captions are absent (captions disabled)', () => {
    const html = 'var ytInitialPlayerResponse = {"videoDetails":{"videoId":"x"}};var x=1;';
    expect(extractCaptionTracks(html)).toEqual([]);
  });
});
