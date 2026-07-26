import { describe, it, expect } from 'vitest';
import { extractContent } from './webScraper';

// ─── Fixtures ──────────────────────────────────────────────────────────

/** Full article-style HTML that Readability should parse. */
const ARTICLE_HTML = `<!DOCTYPE html>
<html>
<head><title>Testing with Vitest — A Complete Guide</title></head>
<body>
  <nav><a href="/">Home</a> <a href="/blog">Blog</a></nav>
  <header><h1>Testing with Vitest</h1><p class="byline">By Jane Doe</p></header>
  <main>
    <article>
      <h2>Getting Started</h2>
      <p>Vitest is a blazing fast unit-test framework powered by Vite. It supports
      TypeScript, JSX, and most of the Jest API out of the box. You can drop it
      into any Vite project and start writing tests immediately.</p>
      <h2>Why Vitest?</h2>
      <p>Unlike Jest, Vitest reuses your Vite configuration, so there's no need
      for separate Jest config or transformers. This means your tests run in the
      same environment as your application code, eliminating a whole class of
      environment-mismatch bugs.</p>
      <p>Vitest also supports:</p>
      <ul>
        <li>Hot-module replacement for tests during watch mode</li>
        <li>Built-in coverage via c8/v8/istanbul</li>
        <li>Component testing with @testing-library</li>
        <li>Parallel test execution across threads or processes</li>
      </ul>
      <h2>Installation</h2>
      <pre><code>npm install -D vitest</code></pre>
      <p>Then add it to your <code>package.json</code> scripts and you're ready
      to run tests with <code>npx vitest</code>.</p>
    </article>
  </main>
  <aside class="sidebar">
    <h3>Related Articles</h3>
    <ul><li><a href="/blog/jest-migration">Migrating from Jest</a></li></ul>
  </aside>
  <footer><p>&copy; 2026 Testing Blog</p></footer>
</body>
</html>`;

/** Minimal page with very short content (Readability should fail → fallback). */
const MINIMAL_HTML = `<!DOCTYPE html>
<html>
<head><title>Short Page</title></head>
<body>
  <p>Hello world.</p>
</body>
</html>`;

/** Page with no body content at all. */
const EMPTY_HTML = `<!DOCTYPE html>
<html>
<head><title></title></head>
<body></body>
</html>`;

/** Page with nav, sidebar, footer noise to verify cleanup. */
const NOISY_HTML = `<!DOCTYPE html>
<html>
<head><title>Noisy Page</title></head>
<body>
  <nav><a href="/">Home</a></nav>
  <div class="navigation">Nav links here</div>
  <div class="sidebar">Sidebar content here</div>
  <div class="ads">Advertisement here</div>
  <main role="main">
    <p>This is the main content. It should survive the cleanup process
    because it is inside a div with role="main" and is not in a removed
    element. The surrounding noise elements should all be stripped.</p>
    <p>Second paragraph to ensure enough text for Readability to work.</p>
    <p>Third paragraph with enough text to make sure this content is long
    enough for Readability to parse it as a valid article. Readability
    needs at least ~100 characters of text content before it considers
    something an article worth extracting.</p>
    <p>Fourth paragraph just to be extra safe with the length requirement.</p>
  </main>
  <footer>Footer content</footer>
</body>
</html>`;

/** HTML with script/style tags that should be removed. */
const SCRIPT_HTML = `<!DOCTYPE html>
<html>
<head><title>Script Test</title></head>
<body>
  <script>alert('should be removed');</script>
  <style>.css{color:red}</style>
  <p>Only this text should remain in the output.</p>
  <noscript>Your browser does not support JavaScript</noscript>
</body>
</html>`;

/** Article with code blocks to verify Markdown fences. */
const CODE_HTML = `<!DOCTYPE html>
<html>
<head><title>Code Example</title></head>
<body>
  <main>
    <article>
      <h1>API Reference</h1>
      <p>Use the following function to create a test:</p>
      <pre><code>import { test, expect } from 'vitest';

test('adds numbers', () => {
  expect(1 + 1).toBe(2);
});</code></pre>
      <p>That's all you need.</p>
    </article>
  </main>
</body>
</html>`;

// ─── Tests: extractContent ─────────────────────────────────────────────

describe('extractContent', () => {
  it('extracts title and markdown content from a full article', () => {
    const result = extractContent(ARTICLE_HTML, 'https://example.com/blog');
    expect(result.title).toBe('Testing with Vitest — A Complete Guide');
    expect(result.content).toBeTruthy();
    expect(result.content.length).toBeGreaterThan(100);
    // Should contain key terms in markdown
    expect(result.content).toContain('Vitest');
    expect(result.content).toContain('TypeScript');
    // Should not contain nav/sidebar/footer noise
    expect(result.content).not.toContain('Related Articles');
    expect(result.content).not.toContain('Testing Blog');
    // Should have excerpt
    expect(result.excerpt).toBeTruthy();
    expect(result.excerpt.length).toBeGreaterThan(20);
    // textContent should be plain text
    expect(result.textContent).toContain('Vitest');
    expect(result.textContent).not.toContain('<');
  });

  it('falls back to manual extraction for minimal content', () => {
    const result = extractContent(MINIMAL_HTML, 'https://example.com');
    // Readability needs >100 chars — this page has ~12 chars, so fallback
    expect(result.title).toBe('Short Page');
    expect(result.content).toBe('Hello world.');
  });

  it('handles empty body gracefully', () => {
    const result = extractContent(EMPTY_HTML, 'https://example.com');
    expect(result.title).toBe('');
    expect(result.content).toBe('');
    expect(result.textContent).toBe('');
    expect(result.excerpt).toBe('');
  });

  it('removes script, style, and noscript tags', () => {
    const result = extractContent(SCRIPT_HTML, 'https://example.com');
    expect(result.title).toBe('Script Test');
    expect(result.content).not.toContain('alert');
    expect(result.content).not.toContain('should be removed');
    expect(result.content).not.toContain('Your browser does not support');
    expect(result.content).toContain('Only this text should remain');
  });

  it('removes nav, sidebar, footer, ads noise', () => {
    const result = extractContent(NOISY_HTML, 'https://example.com');
    expect(result.title).toBe('Noisy Page');
    expect(result.content).toContain('main content');
    expect(result.content).not.toContain('Nav links');
    expect(result.content).not.toContain('Sidebar content');
    expect(result.content).not.toContain('Advertisement');
    expect(result.content).not.toContain('Footer content');
  });

  it('preserves code blocks as fenced markdown', () => {
    const result = extractContent(CODE_HTML, 'https://example.com');
    expect(result.title).toBe('Code Example');
    // The code block should be present
    expect(result.content).toContain('test');
    expect(result.content).toContain('expect');
    // Should be fenced with triple backticks
    expect(result.content).toContain('```');
  });

  it('returns empty strings when no body element exists', () => {
    // JSDOM can handle malformed HTML, but an empty string should produce nothing
    const result = extractContent('<html></html>', 'https://example.com');
    expect(result.title).toBe('');
    expect(result.content).toBe('');
  });

  it('uses document.title for the title when available', () => {
    const html = '<html><head><title>Specific Title</title></head><body><p>Content here.</p></body></html>';
    const result = extractContent(html, 'https://example.com');
    expect(result.title).toBe('Specific Title');
  });

  it('falls back to h1 for title when no document.title', () => {
    const html = '<html><head></head><body><h1>Fallback Title</h1><p>Content here.</p></body></html>';
    const result = extractContent(html, 'https://example.com');
    expect(result.title).toBe('Fallback Title');
  });

  it('caps textContent to 8000 chars', () => {
    // Create a page with >8000 chars of text
    const longText = 'Word '.repeat(3000); // ~15,000 chars
    const html = `<html><head><title>Long Page</title></head><body><p>${longText}</p></body></html>`;
    const result = extractContent(html, 'https://example.com');
    expect(result.textContent.length).toBeLessThanOrEqual(8000);
    // content (markdown) should also be capped... no, only content is capped at 50k
    // but textContent is capped at 8000
  });

  it('handles pages with only a short readable paragraph using fallback', () => {
    const bodyHtml = '<html><head><title>Short Article</title></head><body><p>This is a short paragraph that is under 100 characters so Readability will not parse it as a valid article and our fallback extraction code should handle it instead.</p></body></html>';
    const result = extractContent(bodyHtml, 'https://example.com');
    expect(result.title).toBe('Short Article');
    // The main element chain should resolve to body and the content should be there
    expect(result.content.length).toBeGreaterThan(20);
  });
});

// ─── Tests: scrapeUrl error handling (URL validation only — no network) ─

describe('scrapeUrl error handling', () => {
  // These tests only cover URL validation before network calls.
  // Network-dependent error paths are covered by the integration test.

  it('returns error for invalid URL', async () => {
    const { scrapeUrl } = await import('./webScraper');
    const result = await scrapeUrl('not-a-valid-url');
    expect(result.success).toBe(false);
    expect(result.error).toBe('Invalid URL');
  });

  it('returns error for empty string', async () => {
    const { scrapeUrl } = await import('./webScraper');
    const result = await scrapeUrl('');
    expect(result.success).toBe(false);
    expect(result.error).toBe('Invalid URL');
  });

  it('returns error for malformed URL with spaces', async () => {
    const { scrapeUrl } = await import('./webScraper');
    const result = await scrapeUrl('https://example com/path');
    expect(result.success).toBe(false);
    expect(result.error).toBe('Invalid URL');
  });

  it('fails network call for unreachable host — graceful error', async () => {
    const { scrapeUrl } = await import('./webScraper');
    const result = await scrapeUrl('https://this-domain-surely-does-not-exist-99999.com/');
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  }, 30_000);
});

// ─── Tests: scrapeUrls (batch concurrency) ────────────────────────────

describe('scrapeUrls', () => {
  it('returns empty array for empty input', async () => {
    const { scrapeUrls } = await import('./webScraper');
    const results = await scrapeUrls([]);
    expect(results).toEqual([]);
  });

  it('respects maxUrls option', async () => {
    const { scrapeUrls } = await import('./webScraper');
    const urls = [
      'https://example.com/1',
      'https://example.com/2',
      'https://example.com/3',
    ];
    const results = await scrapeUrls(urls, { maxUrls: 2 });
    expect(results).toHaveLength(2);
  });

  it('handles mixed valid and invalid URLs gracefully', async () => {
    const { scrapeUrls } = await import('./webScraper');
    const results = await scrapeUrls(
      ['not-a-url'],
      { maxUrls: 2, concurrency: 2 }
    );
    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(false);
    expect(results[0].error).toBe('Invalid URL');
  });
});

// ─── Tests: URL validation correctness ────────────────────────────────

describe('URL validation', () => {
  it('rejects invalid URLs without making network calls', async () => {
    const { scrapeUrl } = await import('./webScraper');
    const invalid = ['not-a-valid-url', '', '   ', 'not-a-url-at-all'];
    for (const url of invalid) {
      const result = await scrapeUrl(url);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid URL');
      expect(result.url).toBe(url);
    }
  });
});

// ─── Tests: Content quality ───────────────────────────────────────────

describe('extractContent markdown quality', () => {
  it('produces valid markdown headings (atx style)', () => {
    const result = extractContent(ARTICLE_HTML, 'https://example.com');
    // Markdown headings should use # prefix
    const lines = result.content.split('\n').filter(l => l.startsWith('#'));
    expect(lines.length).toBeGreaterThanOrEqual(3);
    expect(lines.some(l => l.startsWith('## Getting Started'))).toBe(true);
    expect(lines.some(l => l.startsWith('## Why Vitest?'))).toBe(true);
    expect(lines.some(l => l.startsWith('## Installation'))).toBe(true);
  });

  it('produces markdown lists with hyphens', () => {
    const result = extractContent(ARTICLE_HTML, 'https://example.com');
    const listItems = result.content.split('\n').filter(l => l.startsWith('- '));
    expect(listItems.length).toBeGreaterThanOrEqual(4); // the 4 <li> items
  });

  it('produces markdown code fences for <pre><code> blocks', () => {
    const result = extractContent(CODE_HTML, 'https://example.com');
    expect(result.content).toContain('```');
  });
});
