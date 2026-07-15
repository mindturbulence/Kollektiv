/**
 * pi extension: Playwright Browser Control
 *
 * Gives pi browser automation tools via the Docker Playwright MCP container.
 * Maintains a long-lived browser session.
 *
 * Requires: Docker Playwright MCP image (already in your kollektiv profile)
 *   docker pull mcp/playwright
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { spawn, type ChildProcess } from "node:child_process";


// ── MCP JSON-RPC helpers ──────────────────────────────────────────

interface McpRequest {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params?: Record<string, unknown>;
}

interface McpResponse {
  jsonrpc: "2.0";
  id: number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

interface ContentBlock {
  type: string;
  text?: string;
  data?: string;
  mimeType?: string;
}

interface McpToolResult {
  content: ContentBlock[];
  isError?: boolean;
}

// ── Playwright Bridge ─────────────────────────────────────────────

class PlaywrightBridge {
  private proc: ChildProcess | null = null;
  private buffer = "";
  private pending = new Map<
    number,
    { resolve: (v: McpResponse) => void; reject: (e: Error) => void }
  >();
  private msgId = 0;
  private _ready = false;

  get ready() {
    return this._ready;
  }

  async start(): Promise<void> {
    if (this.proc) return;

    this.proc = spawn("docker", [
      "run",
      "-i",
      "--rm",
      "--init",
      "--pull",
      "never",
      "mcp/playwright@sha256:097d978439237cc9b12e10825836a97245add2be0479272cce9d98c368f024d1",
    ], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    this.proc.stdout!.on("data", (data: Buffer) => {
      this.buffer += data.toString();
      this.processBuffer();
    });

    this.proc.stderr!.on("data", (data: Buffer) => {
      const msg = data.toString().trim();
      if (msg) console.error("[pw]", msg);
    });

    this.proc.on("exit", (code) => {
      console.error("[pw] exited with code", code);
      this._ready = false;
      this.proc = null;
      for (const [, p] of this.pending) p.reject(new Error("Playwright MCP exited"));
      this.pending.clear();
    });

    this.proc.on("error", (err) => {
      console.error("[pw] error:", err.message);
      this._ready = false;
    });

    // Initialize MCP connection
    await this.send("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "pi", version: "1.0" },
    });

    // Send initialized notification (no id — it's a notification in MCP spec)
    // But the server seems to ignore/warn on it, proceed directly
    this._ready = true;
    console.error("[pw] initialized");
  }

  private processBuffer(): void {
    let newlineIdx: number;
    while ((newlineIdx = this.buffer.indexOf("\n")) !== -1) {
      const line = this.buffer.slice(0, newlineIdx).trim();
      this.buffer = this.buffer.slice(newlineIdx + 1);
      if (!line) continue;
      try {
        const msg = JSON.parse(line) as McpResponse;
        if (msg.id !== undefined && this.pending.has(msg.id)) {
          const { resolve } = this.pending.get(msg.id)!;
          this.pending.delete(msg.id);
          resolve(msg);
        }
        // Notifications and other messages without matching id are ignored
      } catch {
        // skip non-JSON output
      }
    }
  }

  private async send(
    method: string,
    params?: Record<string, unknown>,
  ): Promise<McpResponse> {
    if (!this.proc?.stdin) throw new Error("Playwright MCP not running");

    const id = ++this.msgId;
    const request: McpRequest = { jsonrpc: "2.0", id, method };
    if (params) request.params = params;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`MCP request ${method} timed out after 30s`));
      }, 30000);

      this.pending.set(id, {
        resolve: (v) => {
          clearTimeout(timeout);
          resolve(v);
        },
        reject: (e) => {
          clearTimeout(timeout);
          reject(e);
        },
      });

      this.proc!.stdin!.write(JSON.stringify(request) + "\n");
    });
  }

  async callTool(
    name: string,
    args: Record<string, unknown> = {},
  ): Promise<McpToolResult> {
    if (!this._ready) throw new Error("Playwright MCP not ready. Try again.");
    const resp = await this.send("tools/call", { name, arguments: args });
    if (resp.error)
      throw new Error(`Playwright error: ${resp.error.message}`);
    return resp.result as McpToolResult;
  }

  async stop(): Promise<void> {
    if (this.proc) {
      this.proc.kill("SIGTERM");
      // Give it a moment, then force kill
      setTimeout(() => {
        if (this.proc) this.proc.kill("SIGKILL");
      }, 2000);
      this.proc = null;
    }
    this._ready = false;
    this.pending.clear();
    this.buffer = "";
  }
}

// ── Helpers ───────────────────────────────────────────────────────

function extractText(result: McpToolResult): string {
  return result.content
    .filter((c) => c.type === "text" && c.text)
    .map((c) => c.text!)
    .join("\n");
}

function extractScreenshot(
  result: McpToolResult,
): { data: string; mimeType: string } | null {
  const img = result.content.find(
    (c) => c.type === "image" || (c.data && c.mimeType?.startsWith("image/")),
  );
  if (img) return { data: img.data!, mimeType: img.mimeType ?? "image/png" };
  return null;
}

// ── Extension ─────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  const bridge = new PlaywrightBridge();
  let activeUrl = "";

  // Start bridge on first use (lazy start)
  async function ensureBridge(ctx: ExtensionContext) {
    if (!bridge.ready) {
      ctx.ui.notify("Starting Playwright browser...", "info");
      try {
        await bridge.start();
        ctx.ui.notify("Playwright browser ready ✅", "info");
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        ctx.ui.notify(`Failed to start Playwright: ${msg}`, "error");
        throw e;
      }
    }
  }

  // Stop bridge on session shutdown
  pi.on("session_shutdown", async () => {
    await bridge.stop();
  });

  // ── Tool: Navigate ──────────────────────────────────────────────

  pi.registerTool({
    name: "browser_navigate",
    label: "Browser Navigate",
    description:
      "Navigate the browser to a URL. Always use this first before other browser tools. Asks for confirmation on external URLs.",
    promptSnippet: "Control a browser — navigate, click, type, and take screenshots",
    promptGuidelines: [
      "Use browser_navigate first to open a page",
      "After navigating, use browser_snapshot to read the page content",
      "Use browser_click with the target string from the snapshot",
    ],
    parameters: Type.Object({
      url: Type.String({ description: "Full URL to navigate to (e.g. https://example.com)" }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const url = params.url;

      // Permission gate for external URLs
      const isLocal =
        url.includes("localhost") ||
        url.includes("127.0.0.1") ||
        url.includes("0.0.0.0");

      if (!isLocal) {
        const ok = await ctx.ui.confirm(
          "Open external URL?",
          `Allow browser to navigate to:\n${url}`,
        );
        if (!ok) {
          return {
            content: [{ type: "text", text: `❌ Blocked: navigation to ${url} was rejected.` }],
          };
        }
      }

      try {
        await ensureBridge(ctx);
        await bridge.callTool("browser_navigate", { url });
        activeUrl = url;
        return {
          content: [{ type: "text", text: `✅ Navigated to ${url}` }],
        };
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return { content: [{ type: "text", text: `❌ ${msg}` }], isError: true };
      }
    },
  });

  // ── Tool: Snapshot ──────────────────────────────────────────────

  pi.registerTool({
    name: "browser_snapshot",
    label: "Browser Snapshot",
    description:
      "Read the current page's accessibility tree. Use this to see what's on the page — buttons, links, text, form fields. Each element has a target string you can pass to browser_click or browser_type.",
    parameters: Type.Object({}),
    async execute() {
      try {
        if (!bridge.ready) {
          return {
            content: [{ type: "text", text: "No page open. Use browser_navigate first." }],
          };
        }
        const result = await bridge.callTool("browser_snapshot", { boxes: true });
        const text = extractText(result);
        return {
          content: [
            {
              type: "text",
              text:
                text ||
                "(page is empty or not loaded)",
            },
          ],
        };
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return { content: [{ type: "text", text: `❌ ${msg}` }], isError: true };
      }
    },
  });

  // ── Tool: Click ─────────────────────────────────────────────────

  pi.registerTool({
    name: "browser_click",
    label: "Browser Click",
    description:
      "Click an element on the page. Get the target string from browser_snapshot output, or use a CSS selector like 'button#submit'.",
    parameters: Type.Object({
      target: Type.String({
        description:
          'Element target reference from browser_snapshot output, or a CSS selector like "button#submit"',
      }),
      element: Type.Optional(
        Type.String({
          description:
            "Human-readable description of what you're clicking (shown to user for permission)",
        }),
      ),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const desc = params.element || params.target;
      const ok = await ctx.ui.confirm("Click element?", `Click on: ${desc}`);
      if (!ok) {
        return { content: [{ type: "text", text: `❌ Click blocked.` }] };
      }

      try {
        await bridge.callTool("browser_click", { target: params.target });
        return {
          content: [{ type: "text", text: `✅ Clicked: ${desc}` }],
        };
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return {
          content: [
            {
              type: "text",
              text: `❌ Click failed: ${msg}\n\nTry browser_snapshot first to get current page state.`,
            },
          ],
          isError: true,
        };
      }
    },
  });

  // ── Tool: Type ──────────────────────────────────────────────────

  pi.registerTool({
    name: "browser_type",
    label: "Browser Type",
    description:
      "Type text into an input field. Get the target from browser_snapshot.",
    parameters: Type.Object({
      target: Type.String({
        description: "Element target reference from browser_snapshot, or CSS selector",
      }),
      text: Type.String({ description: "Text to type into the field" }),
      submit: Type.Optional(
        Type.Boolean({ description: "Press Enter after typing (default: false)" }),
      ),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const preview =
        params.text.length > 80
          ? params.text.slice(0, 80) + "..."
          : params.text;
      const ok = await ctx.ui.confirm(
        "Type into field?",
        `Into: ${params.target}\nText: "${preview}"`,
      );
      if (!ok) {
        return { content: [{ type: "text", text: `❌ Typing blocked.` }] };
      }

      try {
        const args: Record<string, unknown> = {
          target: params.target,
          text: params.text,
        };
        if (params.submit) args.submit = true;
        await bridge.callTool("browser_type", args);
        return {
          content: [{ type: "text", text: `✅ Typed into: ${params.target}` }],
        };
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return { content: [{ type: "text", text: `❌ ${msg}` }], isError: true };
      }
    },
  });

  // ── Tool: Screenshot ────────────────────────────────────────────

  pi.registerTool({
    name: "browser_screenshot",
    label: "Browser Screenshot",
    description:
      "Take a screenshot of the current page. Shows the image in the chat.",
    parameters: Type.Object({
      fullPage: Type.Optional(
        Type.Boolean({
          description: "Capture full scrollable page (default: viewport only)",
        }),
      ),
    }),
    async execute(_toolCallId, params) {
      try {
        const args: Record<string, unknown> = { type: "png" };
        if (params.fullPage) args.fullPage = true;
        const result = await bridge.callTool("browser_take_screenshot", args);
        const screenshot = extractScreenshot(result);
        if (screenshot) {
          return {
            content: [
              { type: "text", text: "📸 Screenshot:" },
              { type: "image", data: screenshot.data, mimeType: screenshot.mimeType },
            ],
          };
        }
        const text = extractText(result);
        return { content: [{ type: "text", text: text || "(screenshot taken)" }] };
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return { content: [{ type: "text", text: `❌ ${msg}` }], isError: true };
      }
    },
  });

  // ── Tool: Wait For ──────────────────────────────────────────────

  pi.registerTool({
    name: "browser_wait",
    label: "Browser Wait",
    description:
      "Wait for text to appear or disappear on the page, or wait a specific number of seconds.",
    parameters: Type.Object({
      text: Type.Optional(
        Type.String({ description: "Wait until this text appears on the page" }),
      ),
      textGone: Type.Optional(
        Type.String({ description: "Wait until this text disappears from the page" }),
      ),
      time: Type.Optional(
        Type.Number({ description: "Wait this many seconds" }),
      ),
    }),
    async execute(_toolCallId, params) {
      try {
        const args: Record<string, unknown> = {};
        if (params.text) args.text = params.text;
        if (params.textGone) args.textGone = params.textGone;
        if (params.time) args.time = params.time;
        await bridge.callTool("browser_wait_for", args);
        return { content: [{ type: "text", text: "✅ Wait complete" }] };
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return { content: [{ type: "text", text: `❌ ${msg}` }], isError: true };
      }
    },
  });

  // ── Tool: Close ─────────────────────────────────────────────────

  pi.registerTool({
    name: "browser_close",
    label: "Browser Close",
    description: "Close the current browser page.",
    parameters: Type.Object({}),
    async execute() {
      try {
        await bridge.callTool("browser_close");
        activeUrl = "";
        return { content: [{ type: "text", text: "✅ Browser closed." }] };
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return { content: [{ type: "text", text: `❌ ${msg}` }], isError: true };
      }
    },
  });

  // ── Tool: Evaluate JS ───────────────────────────────────────────

  pi.registerTool({
    name: "browser_evaluate",
    label: "Browser Evaluate",
    description:
      "Run JavaScript in the page context. Returns the result as text. For inspecting page state only.",
    parameters: Type.Object({
      code: Type.String({
        description:
          'JavaScript code to run. Example: "document.title" or "() => document.querySelector(\'h1\').textContent"',
      }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const ok = await ctx.ui.confirm("Run JavaScript?", `Code:\n${params.code.slice(0, 200)}`);
      if (!ok) {
        return { content: [{ type: "text", text: `❌ JS execution blocked.` }] };
      }
      try {
        const result = await bridge.callTool("browser_evaluate", {
          function: params.code,
        });
        const text = extractText(result);
        return { content: [{ type: "text", text: text || "(no result)" }] };
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return { content: [{ type: "text", text: `❌ ${msg}` }], isError: true };
      }
    },
  });

  // ── Command: /browser-status ────────────────────────────────────

  pi.registerCommand("browser-status", {
    description: "Check browser connection status",
    handler: async (_args, ctx) => {
      if (bridge.ready) {
        ctx.ui.notify(
          `✅ Browser ready | Active: ${activeUrl || "no page loaded"}`,
          "info",
        );
      } else {
        ctx.ui.notify(
          "❌ Browser not started. Use browser_navigate to start it.",
          "error",
        );
      }
    },
  });
}
