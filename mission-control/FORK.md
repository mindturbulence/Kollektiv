# Fork notice

This directory is a fork of [builderz-labs/mission-control](https://github.com/builderz-labs/mission-control),
MIT licensed, Copyright (c) 2026 Builderz Labs. The upstream LICENSE is retained in this directory.

**Forked at upstream commit:** `17186288ef28341723999a040b3b7baa55427a2c`

## Why this fork diverges

- Framing headers relaxed so the app can be embedded same-origin inside Kollektiv's shell
  (`src/lib/csp.ts`, `src/proxy.ts`, `next.config.js`).
- Served from the `/mission-control` subpath rather than the origin root (`next.config.js`).
- A Kollektiv theme bridge component applies Kollektiv's active DaisyUI theme to this app's
  Tailwind 4 tokens (`src/components/kollektiv-theme-bridge.tsx`).
- Terminal/tmux gating for Windows, since upstream's PTY terminal assumes a Unix host
  (`src/app/api/pty/setup`, `src/lib/terminal-availability.ts`).
- A semantic color-token migration across ~60 component files, replacing literal Tailwind
  color classes with theme-aware tokens so the app follows Kollektiv's active theme.
- Windows-compatibility fixes to upstream's own test suite (path separators, CRLF
  normalization, shell resolution for `.cmd` files on Windows).
- The dev port (`3100`) is hardcoded in `package.json`'s `dev`/`start` scripts rather than
  left at upstream's default, so it doesn't collide with Kollektiv's own dev server.

## Re-syncing with upstream

Diff upstream's new tree against the recorded fork point, then reapply the changes above by hand.
There is no git remote link, so this is a manual merge.
