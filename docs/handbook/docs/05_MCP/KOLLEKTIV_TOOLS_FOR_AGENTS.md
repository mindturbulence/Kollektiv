# Kollektiv tools for Mission Control agents

Kollektiv runs its own MCP server on every boot — `startKollektivMcp({ port: 3012 })`
in `server.ts` — serving the 100 tools declared in `mcp-config.json` over
StreamableHTTP. The HTTP handler does no path routing, so any path on port 3012
is the MCP endpoint.

## Registering

Run in the project directory the agent works in:

    claude mcp add --transport http kollektiv http://127.0.0.1:3012/

Kollektiv must be running (`pnpm dev`) for the endpoint to answer.

## Two constraints worth knowing before relying on this

**62 of the 100 tools are `browser-context`.** They execute inside Kollektiv's
browser tab, so they only work while Kollektiv is open in a browser. The
remaining 38 are `server-context` and work headlessly. Check a tool's
`executionKind` in `mcp-config.json` before depending on it from an unattended
agent.

**35 tools declare a `permissions` array.** These are gated by
`CALLER_PERMISSIONS` in `services/kollektivMcp.ts`; `grantMcpPermissions()`
must have been called from the browser side or the call is refused with
`Missing required permissions: ...`.

## What Mission Control does and does not do here

Mission Control observes agent sessions — it does not spawn them and has no MCP
client of its own. Registering this server is therefore an agent-side
configuration step, not a Mission Control feature. Mission Control's value is
that the sessions it reports on are the same sessions that have these tools.
