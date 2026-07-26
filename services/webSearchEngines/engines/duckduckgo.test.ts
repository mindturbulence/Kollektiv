import { describe, it, expect } from 'vitest';
import { parseDuckDuckGoResults, unwrapDuckDuckGoUrl } from './duckduckgo';

const FIXTURE_HTML = `
<div class="result results_links results_links_deep result--ad  ">
  <div class="links_main links_deep result__body">
    <h2 class="result__title">
      <a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fads.example.com%2F&rut=abc">Sponsored Result</a>
    </h2>
    <a class="result__snippet" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fads.example.com%2F&rut=abc">An ad snippet.</a>
  </div>
</div>
<div class="result results_links results_links_deep web-result">
  <div class="links_main links_deep result__body">
    <h2 class="result__title">
      <a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fvitest.dev%2F&rut=xyz">Vitest | Next Generation testing framework</a>
    </h2>
    <a class="result__snippet" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fvitest.dev%2F&rut=xyz"><b>Vitest</b> was created to make testing just work for Vite apps.</a>
  </div>
</div>
`;

describe('parseDuckDuckGoResults', () => {
  it('extracts title, url, snippet, and source from organic results', () => {
    const results = parseDuckDuckGoResults(FIXTURE_HTML, 8);
    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      title: 'Vitest | Next Generation testing framework',
      url: 'https://vitest.dev/',
      snippet: 'Vitest was created to make testing just work for Vite apps.',
      source: 'duckduckgo',
    });
  });

  it('skips sponsored (result--ad) rows', () => {
    const results = parseDuckDuckGoResults(FIXTURE_HTML, 8);
    expect(results.some(r => r.url.includes('ads.example.com'))).toBe(false);
  });

  it('respects maxResults', () => {
    expect(parseDuckDuckGoResults(FIXTURE_HTML, 0)).toHaveLength(0);
  });
});

describe('unwrapDuckDuckGoUrl', () => {
  it('decodes the uddg-wrapped redirect param', () => {
    expect(unwrapDuckDuckGoUrl('//duckduckgo.com/l/?uddg=https%3A%2F%2Fvitest.dev%2F&rut=x')).toBe('https://vitest.dev/');
  });

  it('returns the raw href when there is no uddg param', () => {
    expect(unwrapDuckDuckGoUrl('/some/internal/path')).toBe('/some/internal/path');
  });
});
