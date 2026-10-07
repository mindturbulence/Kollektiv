WDL-05 golden-set spike (not product code). Run from the repo root, in order:
`node_modules/.bin/tsx scripts/design-spike/run.ts shots` → `extract` → `bundle` → `build` → `render` (`probe` = $0.02 child-isolation check).
Each step skips outputs already in `test-results/spike/` (delete a file to redo it); every `claude -p` call is capped and logged to `costs.jsonl`, hard stop at $20.
Children run `claude -p --model sonnet --safe-mode --setting-sources ""` (no repo CLAUDE.md), builds in `builds/b1..b4` (b4 = control), each its own `git init` root.
Results and verdict: `test-results/spike/REPORT.md`, `contact-sheet.png`.
