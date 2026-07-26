import { describe, it, expect } from 'vitest';
import { stripOembedHtml, parseOembedResult } from './oembed';

const FIXTURE_HTML = '<blockquote class="twitter-tweet"><p lang="en" dir="ltr">Hello &amp; welcome to &quot;the future&quot;</p>&mdash; Ada Lovelace (@ada) <a href="https://twitter.com/ada/status/1234567890">October 1, 2026</a></blockquote>';

describe('stripOembedHtml', () => {
  it('strips tags and decodes entities, dropping the trailing author/date link', () => {
    expect(stripOembedHtml(FIXTURE_HTML)).toBe('Hello & welcome to "the future" — Ada Lovelace (@ada)');
  });
});

describe('parseOembedResult', () => {
  it('maps the oEmbed response into a minimal TweetResult', () => {
    const result = parseOembedResult({
      html: FIXTURE_HTML,
      author_name: 'Ada Lovelace',
      url: 'https://twitter.com/ada/status/1234567890',
    }, '1234567890');
    expect(result).toEqual({
      text: 'Hello & welcome to "the future" — Ada Lovelace (@ada)',
      author: 'Ada Lovelace',
      url: 'https://twitter.com/ada/status/1234567890',
    });
  });

  it('falls back to a constructed URL when the response omits one', () => {
    const result = parseOembedResult({ html: '<p>x</p>', author_name: 'A' }, '999');
    expect(result.url).toBe('https://twitter.com/i/status/999');
  });
});
