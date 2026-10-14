# Video production canvas for Refiner results (Weave-style) — research, debate, plan

Status: plan only, nothing built. Tickets are in [TASKS.md § 11](TASKS.md).
Decisions were routed through tier-decide (OpenRouter 402 → Claude fallback, confidence self-reported) and debated by a four-member council
(architect-reviewer, ux-researcher, react-specialist, project-idea-validator).

## 1. Research: what Figma Weave (formerly Weavy) actually is

Source quality: the Figma solutions page is first-party but mostly marketing; the rest is competitor and template-seller blogs. Only the
first list is treated as fact.

Documented (figma.com/solutions/figma-ai-tool-weave):
- Node-based canvas; each step of the pipeline is an explicit node.
- Generation nodes for image, video, audio, 3D; the model is picked per node; providers can be mixed in one workflow.
- Editing nodes between generations: masking, relighting, colour grading, compositing, inpainting, outpainting.
- Named nodes and workflows: Storyboard Machine, Compositor Node, Video Compositor.
- Adjust a node, swap the model or re-prompt, then re-run.
- Workflows are reusable on new inputs; a builder can expose a simplified interface so teammates only supply inputs.
- Figma frames can sit next to / feed Weave workflows (announced June 2026).

Not documented on that page: grouping, export formats, real-time co-editing, credit/usage units. Third-party claims (iterator nodes running one
graph over a list of prompts, multi-format export) are unverified.

**The thing Weave sells is execution across providers.** The canvas is the UI of that engine.

## 2. What this repo already has (verified by reading)

| Asset | Where |
|---|---|
| Per-model timestamped / paragraph / block video scripts | `utils/videoDirector.ts`, `services/llmService.ts` |
| Result rendering with pinned timestamps | `components/PromptText.tsx` |
| Script → character / world presets | `services/tools/storyAssetExtractor.ts`, `services/refinerPresetService.ts` |
| Framework-free store + inverse-based undo | `video-editor/core/store.ts`, `video-editor/core/actions/apply.ts` |
| One-way bridge into the Video Editor | `video-editor/bridge/openInVideoEditor.ts` (only module allowed to touch the event bus) |
| Hand-rolled pan / zoom | `image-editor/ui/CanvasViewport.tsx` |
| Executable generation | **Only** Veo / Imagen / Nano Banana through the Gemini key (`services/geminiService.ts` `generateWithVeo`) |
| Node-graph library | none (`package.json`: no xyflow, tldraw, konva) |

Kling, Sora, Runway, Luma, LTX, Seedance etc. are prompt-only: the user pastes the prompt into the vendor tool.
The video-director format itself is still unvalidated with real clips (TASKS § 10 V6 / V12).

## 3. tier-decide rulings (preliminary, self-reported)

| Question | Result | Confidence |
|---|---|---|
| Scope | refiner mode 0.40, read-only view 0.35, standalone page 0.08, video editor 0.17 | 0.40 (undecided) |
| Tech | custom 0.60, xyflow 0.27, konva 0.10, tldraw 0.03 | 0.60 |
| Worth building the full thing now | 0.30 (leans no) | — |
| Router | tier-opus, role architect, thinking xhigh | — |

## 4. Council debate

| Voice | Position | Verdict |
|---|---|---|
| architect-reviewer | Canvas is a **derived view** of the refiner result, custom and minimal; per-node state kept in a small side record; Refiner result tab; kill criterion after 2 weeks | workable-with-changes, 0.65 |
| ux-researcher | The owner's pain is layout, not a graph. A **vertical storyboard** with a preset strip carries the data and is easier to scan, reorder and make accessible. Canvas wins only with branching / reusable sub-workflows | weak for a free-form canvas now, 0.70 |
| project-idea-validator | "A diagram of copy buttons." Most nodes cannot execute. Finish V6/V12 first, build a `Shot[]` model, measure, then maybe canvas | weak as full build, 0.80; **go-small** |
| react-specialist | If free-form wiring, drag and undo are needed, pick **@xyflow/react (MIT)**: custom is ~1,100–1,400 lines plus tuning; traps are text inputs under CSS transform and a11y | pick xyflow, 0.70 (explicitly overrides tier-decide's custom) |

### Where they agree
1. The data model (`shots[]` + shared `presets[]`) is the real MVP and survives if the canvas dies.
2. No persisted node-graph document, no execution engine, no editing nodes (mask / relight / grade) in the first version.
3. A node canvas needs a reason that a list does not: branching variants, several characters feeding different shots, reusable sub-workflows.
4. Validate the linear flow with real clips before investing (V6 / V12).

### Where they disagree, and the resolution
- **Board vs canvas first.** ux and the skeptic say board; architect says derived canvas tab. *Resolution:* board first (cheapest way to fix "hard to pinpoint time"), canvas as a later, read-only, auto-laid-out *view over the same Shot model*, gated on evidence.
- **Custom vs xyflow.** The two answers are for different phases. The architect's estimate assumes auto layout (no drag, connect or undo: ~100 lines). The react-specialist's assumes free-form wiring. *Resolution:* custom pan/zoom while layout is computed; adopt xyflow the day users must wire or drag nodes. Both agree on that fork.
- **Execution.** The skeptic wants one Generate button on Veo only; architect wants per-shot re-run. *Resolution:* Generate on Veo-class only, everything else is "Copy".

## 5. Key technical finding: Beat vs Shot

A *beat* is a line inside one clip's script (`3–5s: …`). A *shot* is one clip generated separately (each ≤ the model's max length).
Whole-timeline models (Veo, Kling) take every beat in a single prompt, so "re-run one beat" really means: rewrite that beat with neighbours as
context, re-join the script, regenerate the whole clip. "Multi-shot production" means several clips that must stay consistent, which is
where a shared character / world preset prefix earns the graph. The plan keeps both levels: `Project → Shot[] → Beat[]`.

## 6. Proposed shape

```
Project { id, concept, presets: Preset[], shots: Shot[] }
Shot    { id, model, durationSec, beats: Beat[], audio, status, outputKey? }
Beat    { start, end, text }                       // parsed from / serialised to the dialect
Preset  { kind: 'character' | 'world' | 'style', text }   // prefixed to every shot prompt
```
- Parser/serialiser is pure and dialect-aware (reuses `buildTimelineSkeleton`, `validateTimeline`).
- Presets reuse `RefinerPreset` kinds already produced by the story extractor.
- Generated blobs go through the existing asset path (Assets / Gallery), not a second store.
- Canvas (later) = nodes: Concept → Preset(s) → Shot(s) → Result / Send-to-Editor, edges implicit by sequence.

## 7. Phasing and gates

| Phase | What | Gate to continue |
|---|---|---|
| 0 | V6 / V12: real clips on Veo, Kling, Sora, LTX | format works; otherwise fix the format first |
| 1 | Shot model, beat parser, board tab, re-refine one beat, copy all | used on ≥ 1 in 3 video refines for 2 weeks (local counter) |
| 2 | Presets strip, multi-shot generation with shared prefix, Veo Generate, send to Video Editor | per-shot re-run is used more than once per session |
| 3 | Read-only auto-laid-out canvas view (custom pan/zoom) | someone asks for branching variants or reusable workflows |
| 4 | Free-form canvas with editable edges (xyflow, lazy-loaded, daisyUI tokens override) | demand from phase 3; a second executable provider exists |

Kill criterion for phases 1–3: because the canvas is derived, deleting the tab loses no data.

## 8. Risks

- Per-shot generation may be fiction for whole-timeline models (see § 5) — verify in phase 0.
- A second asset store for generated clips — reuse Assets path.
- xyflow brings its own styling and a11y defaults and a controlled-mode sync with an external store (one-frame lag risk during drag); only relevant in phase 4.
- Scope creep into editing nodes / scheduling / collaboration is a different product; cap it.
- License: xyflow is MIT (deps ISC / BSD-3), compatible with GPL-3.0. Weave itself is proprietary — features only, no code, no visual theme (owner rule).

## 9. Verdict

Workable with changes, confidence ~0.7. A free-form Weave-style canvas now is weak (all four voices plus tier-decide at 0.30). The strong
version is: **Shot/Beat model → storyboard board → derived canvas view → free-form canvas only on demand.**
