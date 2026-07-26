import { describe, it, expect } from 'vitest';
import { computeSyndicationToken, parseSyndicationResult } from './syndicationCdn';

describe('computeSyndicationToken', () => {
  it('is deterministic for a given tweet ID', () => {
    const id = '1234567890123456789';
    expect(computeSyndicationToken(id)).toBe(computeSyndicationToken(id));
  });

  it('produces different tokens for different IDs', () => {
    expect(computeSyndicationToken('1111111111111111111')).not.toBe(computeSyndicationToken('2222222222222222222'));
  });

  it('matches the known react-tweet derivation for a fixed ID', () => {
    const id = '1445078208190291973';
    const expected = ((Number(id) / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, '');
    expect(computeSyndicationToken(id)).toBe(expected);
  });
});

describe('parseSyndicationResult', () => {
  it('maps a full tweet-result payload', () => {
    const result = parseSyndicationResult({
      text: 'Hello world',
      id_str: '1234567890',
      user: { name: 'Ada Lovelace', screen_name: 'ada' },
      favorite_count: 10,
      retweet_count: 2,
      conversation_count: 3,
      photos: [{ url: 'https://pbs.twimg.com/media/abc.jpg' }],
    });
    expect(result).toEqual({
      text: 'Hello world',
      author: 'Ada Lovelace (@ada)',
      url: 'https://twitter.com/ada/status/1234567890',
      metrics: { likes: 10, retweets: 2, replies: 3 },
      media: ['https://pbs.twimg.com/media/abc.jpg'],
    });
  });

  it('handles missing engagement fields and no media', () => {
    const result = parseSyndicationResult({ text: 'x', id_str: '1', user: { screen_name: 'foo' } });
    expect(result.metrics).toEqual({ likes: 0, retweets: 0, replies: 0 });
    expect(result.media).toBeUndefined();
  });
});
