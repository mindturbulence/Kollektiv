import { describe, it, expect } from 'vitest';
import { parseBingResults } from './bing';

// Bing SERP HTML snippet with one organic result.
const FIXTURE_HTML = `
<html>
<body>
  <ol id="b_results">
    <li class="b_algo">
      <h2><a href="https://vitest.dev/">Vitest | Next Generation Testing Framework</a></h2>
      <div class="b_caption"><p>A Vite-native testing framework. It's fast.</p></div>
    </li>
    <li class="b_algo">
      <h2><a href="https://example.com/other">Another Result</a></h2>
      <div class="b_caption"><p>Some description here.</p></div>
    </li>
  </ol>
</body>
</html>
`;

describe('parseBingResults', () => {
  it('extracts title, url, snippet, and source from organic results', () => {
    const results = parseBingResults(FIXTURE_HTML, 8);
    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({
      title: 'Vitest | Next Generation Testing Framework',
      url: 'https://vitest.dev/',
      snippet: "A Vite-native testing framework. It's fast.",
      source: 'bing',
    });
  });

  it('respects maxResults', () => {
    expect(parseBingResults(FIXTURE_HTML, 1)).toHaveLength(1);
  });

  it('returns empty array when no results found', () => {
    const html = '<html><body></body></html>';
    expect(parseBingResults(html, 8)).toHaveLength(0);
  });
});
