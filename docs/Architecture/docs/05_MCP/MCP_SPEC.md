# MCP Specification

## Adapter Role

The MCP adapter acts as a translation layer between the app’s runtime and the available external tools exposed through the Model Context Protocol. It allows the assistant or other features to discover capabilities and invoke them without hard-coding every integration path.

## Public Tools

Public tools exposed through the MCP layer should be narrow, explicit, and documented. They should align with the product’s existing capabilities such as file operations, prompt access, assistant actions, or provider bridging rather than exposing the entire app surface.

## Discovery

The client should discover tools from the MCP server at runtime. Discovery should include names, schemas, descriptions, and any required permission or capability metadata so the caller can decide whether it is appropriate to invoke a tool.

## Execution

Tool execution should be reliable and observable. The caller should receive enough context to understand whether the tool succeeded, failed, or needs user confirmation. Retries and idempotency matter for tools that mutate state or interact with local services.

## Security

The MCP layer must avoid widening the attack surface. Tool access should be least-privilege, any destructive action should require clear confirmation, and proxying behavior should be constrained rather than open-ended.

## Current Repository Alignment

The repository already implements the core MCP integration surface in [../../../services/mcpService.ts](../../../services/mcpService.ts). That module defines the transport and tool/resource shapes, while [../../../services/assistantService.ts](../../../services/assistantService.ts) wires MCP tools into the assistant execution loop.
