/**
 * Fetch MCP sub-server for Kollektiv MCP.
 * Fetches URLs and converts HTML to markdown with pagination support.
 * Uses the existing /proxy-remote server endpoint for fetching.
 * Pure JavaScript — no external dependencies needed.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";

// ─── HTML to Markdown converter ──────────────────────────────────────────────
// Lightweight converter that handles common HTML elements.
// Doesn't need turndown or any external library.

function htmlToMarkdown(html: string): string {
  let text = html;

  // Remove script, style, noscript, svg, nav, footer, header
  text = text.replace(/<script[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[\s\S]*?<\/style>/gi, '');
  text = text.replace(/<noscript[\s\S]*?<\/noscript>/gi, '');
  text = text.replace(/<svg[\s\S]*?<\/svg>/gi, '');
  text = text.replace(/<nav[\s\S]*?<\/nav>/gi, '');
  text = text.replace(/<footer[\s\S]*?<\/footer>/gi, '');
  text = text.replace(/<header[\s\S]*?<\/header>/gi, '');

  // Replace common elements with markdown equivalents
  // Headings
  text = text.replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n\n');
  text = text.replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n\n');
  text = text.replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n\n');
  text = text.replace(/<h4[^>]*>(.*?)<\/h4>/gi, '#### $1\n\n');
  text = text.replace(/<h5[^>]*>(.*?)<\/h5>/gi, '##### $1\n\n');
  text = text.replace(/<h6[^>]*>(.*?)<\/h6>/gi, '###### $1\n\n');

  // Links
  text = text.replace(/<a[^>]*href=["'](https?:\/\/[^"']+)["'][^>]*>(.*?)<\/a>/gi, '[$2]($1)');

  // Images
  text = text.replace(/<img[^>]*src=["']([^"']+)["'][^>]*alt=["']([^"']*)["'][^>]*\/?>/gi, '![$2]($1)');
  text = text.replace(/<img[^>]*src=["']([^"']+)["'][^>]*\/?>/gi, '![]($1)');

  // Bold / strong
  text = text.replace(/<(?:b|strong)[^>]*>(.*?)<\/(?:b|strong)>/gi, '**$1**');

  // Italic / em
  text = text.replace(/<(?:i|em)[^>]*>(.*?)<\/(?:i|em)>/gi, '*$1*');

  // Code blocks
  text = text.replace(/<pre><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi, '```\n$1\n```\n\n');
  text = text.replace(/<code[^>]*>(.*?)<\/code>/gi, '`$1`');

  // Blockquotes
  text = text.replace(/<blockquote[^>]*>(.*?)<\/blockquote>/gis, (_, content) => {
    const lines = content.replace(/<br\s*\/?>/gi, '\n').split('\n');
    return lines.map((l: string) => `> ${l.replace(/<[^>]*>/g, '')}`).join('\n') + '\n\n';
  });

  // Horizontal rules
  text = text.replace(/<hr[^>]*\/?>/gi, '\n---\n\n');

  // Unordered lists
  text = text.replace(/<ul[^>]*>([\s\S]*?)<\/ul>/gi, (_: string, content: string) => {
    return content
      .replace(/<li[^>]*>(.*?)<\/li>/gi, (_, item: string) => `- ${item.replace(/<[^>]*>/g, '').trim()}\n`)
      + '\n';
  });

  // Ordered lists
  let listCounter = 0;
  text = text.replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gi, (_: string, content: string) => {
    listCounter = 0;
    return content
      .replace(/<li[^>]*>(.*?)<\/li>/gi, (_, item: string) => {
        listCounter++;
        return `${listCounter}. ${item.replace(/<[^>]*>/g, '').trim()}\n`;
      })
      + '\n';
  });

  // Paragraphs
  text = text.replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n');

  // Line breaks
  text = text.replace(/<br\s*\/?>/gi, '\n');

  // Divs
  text = text.replace(/<div[^>]*>(.*?)<\/div>/gis, '$1\n');

  // Remove remaining tags
  text = text.replace(/<[^>]*>/g, '');

  // Decode HTML entities
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");
  text = text.replace(/&nbsp;/g, ' ');

  // Clean up excessive whitespace
  text = text.replace(/\n{4,}/g, '\n\n\n');
  text = text.replace(/[ \t]+\n/g, '\n');

  return text.trim();
}

// ─── Direct HTTP fetch (no dependency on /proxy-remote) ────────────────────────

async function fetchUrlContent(url: string): Promise<{ content: string; contentType: string }> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; KollektivBot/1.0)',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) {
    throw new Error(`fetch failed: ${res.status} ${res.statusText}`);
  }

  const text = await res.text();
  const contentType = res.headers.get('content-type') || 'text/html';

  return { content: text, contentType };
}

// ─── MCP Server ──────────────────────────────────────────────────────────────

export function createFetchMcpServer(): Server {
  const server = new Server(
    { name: "kollektiv-fetch", version: "1.0.0" },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "fetch",
        description: `Fetches a URL from the internet and extracts its contents as markdown.

You now have internet access via this tool. Use it to fetch the most up-to-date information.
Supports pagination: if content is truncated, call again with start_index set to the next position to continue reading.`,
        inputSchema: {
          type: "object",
          properties: {
            url: {
              type: "string",
              description: "URL to fetch (http or https only)",
            },
            max_length: {
              type: "number",
              description: "Maximum number of characters to return (default: 5000, max: 100000)",
              default: 5000,
            },
            start_index: {
              type: "number",
              description: "Start reading from this character index (for pagination). Default: 0",
              default: 0,
            },
            raw: {
              type: "boolean",
              description: "Return raw content without markdown conversion (default: false)",
              default: false,
            },
          },
          required: ["url"],
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name: toolName, arguments: args } = request.params;

    if (toolName !== "fetch") {
      return {
        content: [{ type: "text", text: `Unknown tool: ${toolName}` }],
        isError: true,
      };
    }

    try {
      const url = String(args?.url || "").trim();
      if (!url) {
        return { content: [{ type: "text", text: "Error: URL is required" }], isError: true };
      }

      // Validate URL
      let parsed: URL;
      try {
        parsed = new URL(url);
      } catch {
        return { content: [{ type: "text", text: `Error: Invalid URL: ${url}` }], isError: true };
      }
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return { content: [{ type: "text", text: "Error: Only http(s) URLs are supported" }], isError: true };
      }

      // SSRF protection: block private/reserved IPs
      const hostname = parsed.hostname.toLowerCase();
      if (
        hostname === "localhost" ||
        hostname === "127.0.0.1" ||
        hostname === "0.0.0.0" ||
        hostname === "[::1]" ||
        hostname.endsWith(".local") ||
        hostname.startsWith("10.") ||
        hostname.startsWith("172.") && parseInt(hostname.split(".")[1], 10) >= 16 && parseInt(hostname.split(".")[1], 10) <= 31 ||
        hostname.startsWith("192.168.") ||
        hostname.startsWith("169.254.")
      ) {
        return {
          content: [{ type: "text", text: `Error: Fetching from private/internal addresses is not allowed (${hostname})` }],
          isError: true,
        };
      }

      const maxLength = Math.min(Math.max(1, Math.floor(Number(args?.max_length) || 5000)), 100000);
      const startIndex = Math.max(0, Math.floor(Number(args?.start_index) || 0));
      const raw = Boolean(args?.raw);

      const { content: rawContent, contentType } = await fetchUrlContent(url);

      // Convert to markdown if HTML and not raw mode
      const isHtml = rawContent.toLowerCase().includes("<html") || contentType.includes("text/html") || !contentType;
      const processed = raw && isHtml ? rawContent : (isHtml ? htmlToMarkdown(rawContent) : rawContent);

      const originalLength = processed.length;

      if (startIndex >= originalLength) {
        return {
          content: [{ type: "text", text: `Contents of ${url}:\n\nNo more content available.` }],
        };
      }

      const truncated = processed.slice(startIndex, startIndex + maxLength);
      const actualLength = truncated.length;
      const remaining = originalLength - (startIndex + actualLength);

      let result = `Contents of ${url}:\n\n${truncated}`;

      // Add pagination hint if there's more content
      if (actualLength === maxLength && remaining > 0) {
        const nextStart = startIndex + actualLength;
        result += `\n\n---\n_Content truncated. Call fetch with start_index=${nextStart} to get more content._`;
      }

      return {
        content: [{ type: "text", text: result }],
      };
    } catch (err: any) {
      return {
        content: [{ type: "text", text: `Error fetching ${args?.url}: ${err?.message || String(err)}` }],
        isError: true,
      };
    }
  });

  return server;
}
