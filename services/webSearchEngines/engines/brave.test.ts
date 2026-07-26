import { describe, it, expect } from 'vitest';
import { parseBraveResults } from './brave';

const FIXTURE_HTML = `
<div data-view-id="mainline_result_0">
  <a href="https://vitest.dev/" class="result-header">
    <span class="title">Vitest | Next Generation Testing Framework</span>
  </a>
  <p class="snippet">A Vite-native testing framework. It's fast.</p>
</div>
<div data-view-id="mainline_result_1">
  <a href="https://example.com/other" class="result-header">
    <span class="title">Other Result</span>
  </a>
  <p class="snippet">Another snippet here.</p>
</div>
`;

describe('parseBraveResults', () => {
  it('extracts title, url, snippet, and source from results', () => {
    const results = parseBraveResults(FIXTURE_HTML, 8);
    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({
      title: 'Vitest | Next Generation Testing Framework',
      url: 'https://vitest.dev/',
      snippet: "A Vite-native testing framework. It's fast.",
      source: 'brave',
    });
  });

  it('respects maxResults', () => {
    expect(parseBraveResults(FIXTURE_HTML, 1)).toHaveLength(1);
  });

  it('skips entries without http links', () => {
    const html = '<div data-view-id="mainline_result_0"><a href="/relative"><span class="title">Relative</span></a></div>';
    expect(parseBraveResults(html, 8)).toHaveLength(0);
  });
});
