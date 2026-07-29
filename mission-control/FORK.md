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

## Re-syncing with upstream

Diff upstream's new tree against the recorded fork point, then reapply the changes above by hand.
There is no git remote link, so this is a manual merge.
