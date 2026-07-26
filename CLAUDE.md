# Project Documentation

## Documentation lookup

All project documentation lives under `docs/handbook/`. Look there first for architecture, design principles, subsystem specs (AI engine, capability platform, knowledge engine, memory, MCP, voice pipeline, providers), and implementation docs — before searching elsewhere or guessing from code alone.

## Plan files

Store all implementation/feature plan documents in `docs/plans/` (e.g. `docs/plans/YYYY-MM-DD-<feature-name>.md`) — a single centralized location, not scattered per-skill directories (e.g. not `docs/superpowers/plans/`). This overrides any skill's default plan-save location.

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
