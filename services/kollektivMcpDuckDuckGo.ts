/**
 * DuckDuckGo search as a standalone MCP sub-server for Kollektiv MCP.
 * Provides API-key-free web search via the DuckDuckGo HTML/Lite endpoints.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { searchDuckDuckGo } from "./duckduckgoService";

export function createDuckDuckGoMcpServer(): Server {
  const server = new Server(
    { name: "kollektiv-duckduckgo-search", version: "1.0.0" },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "duckduckgo_search",
        description:
          "Search the web using DuckDuckGo. No API key required. " +
          "Returns up to 20 results with title, URL, and description. " +
          "Use for general web searches when you need current information.",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "The search query",
            },
            max_results: {
              type: "number",
              description: "Maximum number of results to return (1–20, default 10)",
              default: 10,
            },
            region: {
              type: "string",
              description:
                "Region/language code. Examples: 'us-en' (US English), " +
                "'uk-en' (UK English), 'de-de' (German), 'jp-ja' (Japanese), " +
                "'fr-fr' (French), 'wt-wt' (worldwide). Default: 'wt-wt'",
              default: "wt-wt",
            },
            safesearch: {
              type: "string",
              description: "SafeSearch level: 'on', 'moderate', or 'off'. Default: 'moderate'",
              default: "moderate",
              enum: ["on", "moderate", "off"],
            },
          },
          required: ["query"],
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name: toolName, arguments: args } = request.params;

    if (toolName !== "duckduckgo_search") {
      return {
        content: [{ type: "text", text: `Unknown tool: ${toolName}` }],
        isError: true,
      };
    }

    const query = String(args?.query || "").trim();
    if (!query) {
      return {
        content: [{ type: "text", text: "Error: query is required" }],
        isError: true,
      };
    }

    const maxResults = Math.min(Math.max(1, Math.floor(Number(args?.max_results) || 10)), 20);
    const region = args?.region ? String(args.region) : "wt-wt";
    const safesearch = (args?.safesearch as "on" | "moderate" | "off") || "moderate";

    const { results, error } = await searchDuckDuckGo({
      keywords: query,
      maxResults,
      region,
      safesearch,
    });

    if (error) {
      return {
        content: [{ type: "text", text: `Error: ${error}` }],
        isError: true,
      };
    }

    if (!results.length) {
      return {
        content: [{ type: "text", text: "DuckDuckGo returned no results for that query." }],
      };
    }

    const formatted = results
      .map(
        (r, i) =>
          `${i + 1}. ${r.title}\n   URL: ${r.href}\n   ${r.description}`,
      )
      .join("\n\n");

    return {
      content: [
        {
          type: "text",
          text: `Search results for "${query}":\n\n${formatted}`,
        },
      ],
    };
  });

  return server;
}
