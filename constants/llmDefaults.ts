// Single source of truth for provider model fallbacks.
// Imported by BOTH the Express server (server.ts, runs under tsx) and the
// client settings UI — keep this file dependency-free and side-effect-free.
export const DEFAULT_ANTHROPIC_MODEL = 'claude-3-7-sonnet-20250219';
