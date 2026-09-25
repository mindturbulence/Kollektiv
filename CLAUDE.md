# Project Documentation

## RULE (MANDATORY)

**Rule 1: Do not agree by default.** When the user shares an idea, plan, strategy, opinion, draft, or decision, the agent's first responsibility is to challenge it before helping refine it. Look for weak assumptions, missing context, unclear logic, hidden risks, optimistic thinking, and anything that sounds convincing but may not actually be true.

**Rule 2: Pressure-test before supporting.** Before agreeing to an idea, answer:
- What is the weakest part of this?
- What could go wrong?
- What am I assuming without proof?
- What would a smart critic say?
- What data or context is missing?
- What would make this fail in the real world?
- Where am I being too optimistic?
Be specific. No vague warnings.

**Rule 3: No empty validation.** Do not start with "great idea", "that makes sense", "you're right", or similar phrases unless the idea has already been pressure-tested. If the idea is weak, say it clearly. If the idea is strong, explain why and still show the tradeoffs.
The user wants useful pushback, not reassurance. Decision-ready feedback, not polite agreement.

**Rule 4: Structure feedback.** When possible, structure answers like this:
1. Main concern
2. Weakest assumption
3. Strongest counterargument
4. What to verify
5. Better version of the idea
6. Final recommendation
Be direct, concise, and practical.

**The agent's job is not to make the user feel right. The agent's job is to help the user think better.**

## Jev first (MANDATORY)

Before starting any task, check whether it contains a decision Jev can make: picking one option from a list, scoring on a scale, or a yes/no probability (sorting, triage, classification, routing, prioritising). If it does, use the `jev` skill (`~/.claude/skills/jev/`) for that decision first, then do the writing yourself. **Jev decides, you write.**

- If Jev's confidence is below 0.6, or a yes/no answer falls between 0.3 and 0.7, make the call yourself and say so.
- Anything sent to Jev leaves this machine (OpenRouter → TypeSafe). **Ask the user before sending private text**: this repo's source code, user data, credentials, or client content. Made-up or public text is fine.
- Skip Jev for tasks with no such decision (writing or editing code, debugging, explaining). Never let a Jev failure block work: on any error, carry on without it.

## Documentation lookup

All project documentation lives under `docs/handbook/`. Look there first for architecture, design principles, subsystem specs (AI engine, capability platform, knowledge engine, memory, MCP, voice pipeline, providers), and implementation docs — before searching elsewhere or guessing from code alone.

## Plan files

Store all implementation/feature plan documents in `docs/plans/` (e.g. `docs/plans/YYYY-MM-DD-<feature-name>.md`) — a single centralized location, not scattered per-skill directories (e.g. not `docs/superpowers/plans/`). This overrides any skill's default plan-save location.

## License hygiene (MANDATORY)

Kollektiv is GPL-3.0; VERT (VERT-sh/VERT) is AGPL-3.0. The planned Converter feature (docs/plans/utilities-vert-conversion-plan.md) must use the underlying libraries only (`@imagemagick/magick-wasm`, `@ffmpeg/ffmpeg` — Apache/LGPL/GPL-compatible) and must NEVER port or copy VERT's source code (its SvelteKit glue, converters, or UI) — importing AGPL code would force this entire repo to AGPL-3.0.

## Code Quality Rules (STRICT)

These rules are mandatory. Follow them without exception.

### Before Writing Code

1. **Read the surrounding code first.** Understand the existing patterns, imports, and module boundaries before adding anything.
2. **Trace the execution path mentally.** How will this code be called? What state exists before it runs? What happens after?
3. **Check for circular dependencies.** Don't import a module from within itself or create import cycles.
4. **Verify the types match.** Don't force `as any` to make types compile — fix the actual type mismatch.
5. **Identify failure modes.** What happens if the vault isn't connected? If IDB is empty? If the module hasn't loaded yet?

### After Writing Code

1. **Trace the full lifecycle.** Boot → init → your code runs → what happens next? Does your code survive contact with other modules?
2. **Check consumers.** How will other code use what you wrote? Will they call it in the right order? At the right time?
3. **Test edge cases mentally.** Fresh boot (empty state). Existing data (loaded state). Error states (vault disconnected, permissions denied).
4. **Run `pnpm lint` and `pnpm test` before every commit.** No exceptions.
5. **If you identify a bug in your own code, fix it immediately.** Don't present it as an option. Don't ask permission. Just fix it.

### During Code Review

1. **Fix Critical and Required issues immediately.** Don't list them and ask the user. Fix them.
2. **Verify the fix doesn't break other code.** Run tests after every fix.
3. **Check for hidden side effects.** Does your fix change behavior for existing users? Does it affect other modules?
4. **Don't leave dead code.** If something is unreachable, remove it.
5. **Don't leave circular imports.** If you find one, refactor it.

### Common Failure Patterns (AVOID)

| Pattern | Why It Fails | Fix |
|---------|--------------|-----|
| Check `getAgentMemoryBlock()` before calling `syncAgentMemoryToVault()` | `_agentMemoryBlock` is null on fresh load — nothing sets it first | Check if memories exist in IDB instead |
| `relationshipGraph.clear()` in `hydrateKnowledgeGraph()` | Destroys wikilink edges added at boot, never re-runs extraction | Don't clear graph, or re-run wikilink extraction after rebuild |
| `stampSchemaVersion(manifest as any)` | Forces type cast at every call site, defeats type safety | Fix the generic type or use a different approach |
| Self-import (`import { foo } from './same-module'`) | Circular dependency risk, confusing, unnecessary | Call the function directly since it's in the same module |
| Generate code without reading existing patterns | Produces code that doesn't match the codebase style | Read 3-5 similar files first |

## gstack

For all web browsing tasks, use the `/browse` skill from gstack instead of `mcp__claude-in-chrome__*` tools.

### Available gstack skills

- `/office-hours` — Schedule office hours
- `/plan-ceo-review` — Plan CEO review
- `/plan-eng-review` — Plan engineering review
- `/plan-design-review` — Plan design review
- `/design-consultation` — Design consultation
- `/design-shotgun` — Design shotgun approach
- `/design-html` — Design HTML
- `/review` — Review code
- `/ship` — Ship changes
- `/land-and-deploy` — Land and deploy
- `/canary` — Canary deployment
- `/benchmark` — Run benchmarks
- `/browse` — Browse the web
- `/connect-chrome` — Connect Chrome
- `/qa` — Run QA tests
- `/qa-only` — QA only
- `/design-review` — Design review
- `/setup-browser-cookies` — Setup browser cookies
- `/setup-deploy` — Setup deployment
- `/setup-gbrain` — Setup gbrain
- `/retro` — Retrospective
- `/investigate` — Investigate issues
- `/document-release` — Document release
- `/document-generate` — Generate documentation
- `/codex` — Codex tool
- `/cso` — CSO tool
- `/autoplan` — Auto plan
- `/plan-devex-review` — Plan developer experience review
- `/devex-review` — Developer experience review
- `/careful` — Careful mode
- `/freeze` — Freeze changes
- `/guard` — Guard tool
- `/unfreeze` — Unfreeze changes
- `/gstack-upgrade` — Upgrade gstack
- `/learn` — Learn

## Skill routing

When the user's request matches an available skill, invoke it via the Skill tool. When in doubt, invoke the skill.

Key routing rules:
- Product ideas/brainstorming → invoke /office-hours
- Strategy/scope → invoke /plan-ceo-review
- Architecture → invoke /plan-eng-review
- Design system/plan review → invoke /design-consultation or /plan-design-review
- Full review pipeline → invoke /autoplan
- Bugs/errors → invoke /investigate
- QA/testing site behavior → invoke /qa or /qa-only
- Code review/diff check → invoke /review
- Visual polish → invoke /design-review
- Ship/deploy/PR → invoke /ship or /land-and-deploy
- Save progress → invoke /context-save
- Resume context → invoke /context-restore
- Author a backlog-ready spec/issue → invoke /spec
