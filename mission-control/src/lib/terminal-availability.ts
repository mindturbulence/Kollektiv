/**
 * The terminal viewer attaches to agent sessions with `tmux attach-session`
 * (see lib/pty-manager.ts). tmux has no Windows build, so the feature can
 * never succeed there and its entry point is hidden rather than left to fail
 * with an install hint that names brew and apt.
 */
const TMUX_CAPABLE_PLATFORMS = new Set(['darwin', 'linux'])

export function isTerminalSupported(platform: string): boolean {
  return TMUX_CAPABLE_PLATFORMS.has(platform)
}
