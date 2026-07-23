/**
 * Sequential Thinking MCP sub-server for Kollektiv MCP.
 * Provides a structured thinking tool for dynamic and reflective
 * problem-solving through sequential thoughts, revisions, and branches.
 * Pure JavaScript — no external dependencies needed.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ThoughtData {
  thought: string;
  thoughtNumber: number;
  totalThoughts: number;
  isRevision?: boolean;
  revisesThought?: number;
  branchFromThought?: number;
  branchId?: string;
  needsMoreThoughts?: boolean;
  nextThoughtNeeded: boolean;
}

interface SequentialThinkingState {
  thoughtHistory: ThoughtData[];
  branches: Record<string, ThoughtData[]>;
}

// ─── Server (stateful per-session) ────────────────────────────────────────────

export function createSequentialThinkingMcpServer(): Server {
  // Shared state for this server instance
  const state: SequentialThinkingState = {
    thoughtHistory: [],
    branches: {},
  };

  const server = new Server(
    { name: "kollektiv-sequential-thinking", version: "1.0.0" },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "sequentialthinking",
        description: `A detailed tool for dynamic and reflective problem-solving through thoughts.
This tool helps analyze problems through a flexible thinking process that can adapt and evolve.
Each thought builds on, questions, or revises previous insights as understanding deepens.

When to use this tool:
- Breaking down complex problems into steps
- Planning and design with room for revision
- Analysis that might need course correction
- Problems where the full scope might not be clear initially
- Tasks that need to maintain context over multiple steps

Key features:
- Adjust total_thoughts up or down as you progress
- Question or revise previous thoughts
- Add more thoughts even after reaching what seemed like the end
- Express uncertainty and explore alternative approaches
- Branch or backtrack from any previous thought
- Generate a solution hypothesis and verify it

Parameters:
- thought: Your current thinking step (analysis, revision, question, hypothesis, etc.)
- nextThoughtNeeded: True if more thinking steps are needed
- thoughtNumber: Current number in the thinking sequence
- totalThoughts: Current estimate of total thoughts needed
- isRevision: Whether this thought revises a previous thought
- revisesThought: Which thought number is being reconsidered
- branchFromThought: Which thought number this branches from
- branchId: Identifier for the current branch
- needsMoreThoughts: If reaching end but realizing more thoughts are needed`,
        inputSchema: {
          type: "object",
          properties: {
            thought: {
              type: "string",
              description: "Your current thinking step",
            },
            nextThoughtNeeded: {
              type: "boolean",
              description: "Whether another thought step is needed",
            },
            thoughtNumber: {
              type: "number",
              description: "Current thought number (1, 2, 3, ...)",
            },
            totalThoughts: {
              type: "number",
              description: "Estimated total thoughts needed",
            },
            isRevision: {
              type: "boolean",
              description: "Whether this revises a previous thought",
            },
            revisesThought: {
              type: "number",
              description: "Which thought number is being reconsidered",
            },
            branchFromThought: {
              type: "number",
              description: "Branching point thought number",
            },
            branchId: {
              type: "string",
              description: "Branch identifier",
            },
            needsMoreThoughts: {
              type: "boolean",
              description: "If more thoughts are needed",
            },
          },
          required: ["thought", "nextThoughtNeeded", "thoughtNumber", "totalThoughts"],
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name: toolName, arguments: args } = request.params;

    if (toolName !== "sequentialthinking") {
      return {
        content: [{ type: "text", text: `Unknown tool: ${toolName}` }],
        isError: true,
      };
    }

    try {
      const thoughtData: ThoughtData = {
        thought: String(args?.thought || "").trim(),
        thoughtNumber: typeof args?.thoughtNumber === "number" ? args.thoughtNumber : parseInt(String(args?.thoughtNumber || "0"), 10),
        totalThoughts: typeof args?.totalThoughts === "number" ? args.totalThoughts : parseInt(String(args?.totalThoughts || "1"), 10),
        nextThoughtNeeded: Boolean(args?.nextThoughtNeeded),
      };

      // Validate required fields
      if (!thoughtData.thought) {
        return {
          content: [{ type: "text", text: JSON.stringify({ error: "thought is required", status: "failed" }) }],
          isError: true,
        };
      }
      if (thoughtData.thoughtNumber < 1) {
        return {
          content: [{ type: "text", text: JSON.stringify({ error: "thoughtNumber must be >= 1", status: "failed" }) }],
          isError: true,
        };
      }
      if (thoughtData.totalThoughts < 1) {
        return {
          content: [{ type: "text", text: JSON.stringify({ error: "totalThoughts must be >= 1", status: "failed" }) }],
          isError: true,
        };
      }

      // Optional fields
      if (args?.isRevision !== undefined) thoughtData.isRevision = Boolean(args.isRevision);
      if (args?.revisesThought !== undefined) thoughtData.revisesThought = typeof args.revisesThought === "number" ? args.revisesThought : parseInt(String(args.revisesThought), 10);
      if (args?.branchFromThought !== undefined) thoughtData.branchFromThought = typeof args.branchFromThought === "number" ? args.branchFromThought : parseInt(String(args.branchFromThought), 10);
      if (args?.branchId !== undefined) thoughtData.branchId = String(args.branchId);
      if (args?.needsMoreThoughts !== undefined) thoughtData.needsMoreThoughts = Boolean(args.needsMoreThoughts);

      // Adjust totalThoughts if thoughtNumber exceeds it
      if (thoughtData.thoughtNumber > thoughtData.totalThoughts) {
        thoughtData.totalThoughts = thoughtData.thoughtNumber;
      }

      // Store the thought
      state.thoughtHistory.push(thoughtData);

      // Track branches
      if (thoughtData.branchFromThought && thoughtData.branchId) {
        if (!state.branches[thoughtData.branchId]) {
          state.branches[thoughtData.branchId] = [];
        }
        state.branches[thoughtData.branchId].push(thoughtData);
      }

      // Format response with console-like thought output for the model
      const prefix = thoughtData.isRevision
        ? "🔄 Revision"
        : thoughtData.branchFromThought
          ? "🌿 Branch"
          : "💭 Thought";

      const context = thoughtData.isRevision
        ? ` (revising thought ${thoughtData.revisesThought})`
        : thoughtData.branchFromThought
          ? ` (from thought ${thoughtData.branchFromThought}, ID: ${thoughtData.branchId})`
          : "";

      const header = `${prefix} ${thoughtData.thoughtNumber}/${thoughtData.totalThoughts}${context}`;
      const thoughtPreview = thoughtData.thought.length > 80
        ? thoughtData.thought.slice(0, 80) + "..."
        : thoughtData.thought;

      const formattedThought = `
┌──────────────────────────────────────┐
│ ${header.padEnd(38)} │
├──────────────────────────────────────┤
│ ${thoughtPreview.padEnd(38)} │
└──────────────────────────────────────┘`;

      const result = {
        thoughtNumber: thoughtData.thoughtNumber,
        totalThoughts: thoughtData.totalThoughts,
        nextThoughtNeeded: thoughtData.nextThoughtNeeded,
        branches: Object.keys(state.branches),
        thoughtHistoryLength: state.thoughtHistory.length,
        formatted: formattedThought,
      };

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: error instanceof Error ? error.message : String(error),
            status: "failed",
          }),
        }],
        isError: true,
      };
    }
  });

  return server;
}
