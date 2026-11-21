# diagram-spec — bootstrap brief

> **This document is the complete handover.** It is written to be read cold in a
> fresh session. Everything needed to design, build, and test `diagram-spec` is
> here; nothing else is required context. Place this file at the repo root (as
> `README.md` or `PROJECT.md`) and start from §12 (open decisions).

---

## 1. Problem: why this exists

A request for "an architecture diagram" reliably degrades into a **component /
deployment picture** — boxes for processes, arrows for plumbing — and omits what
the system actually *does*. This happened verbatim when six renderers (Mermaid,
D2, Graphviz, Excalidraw, a hand-written SVG, and fireworks-tech-graph) were all
fed the same content source: all six produced a competent-looking diagram that
answered "what runs where" and none that answered "who talks to whom, in what
order, until when".

The root cause was **not the renderers and not the prompt**. It was the content
source (`spec.md`), which had:

- no **actors** (dev_a, dev_b, reviewer collapsed into one node called "peers"),
- no **loop** (three separate failures: no cycle, no repetition, no exit condition),
- one undifferentiated **edge class** ("control"), so dispatch, relay, and
  reviewer-attestation were indistinguishable edges,
- **no legend** and no band-membership definitions,
- **no reading direction** (so one renderer laid the flow out right-to-left).

Three structural conclusions:

1. The word "architecture" is genuinely ambiguous between *deployment* (what
   exists) and *behaviour* (what happens). Adjectives do not disambiguate it; a
   required two-view structure does.
2. Prose has no failure mode. Every one of these omissions passed silently
   because nothing checked the artifact.
3. The defect lives in the **authoring artifact**, not the prompt. Prompts leave
   nothing durable to review or re-use; the next request starts from zero.

`diagram-spec` exists to make behaviour-first, validated, renderer-agnostic
diagram content the path of least resistance.

## 2. What we are building

A small, deterministic tool with three layers:

| Layer | Form | Responsibility |
|---|---|---|
| **Core** | CLI + library (`dspec`) | Owns the content schema, the validator, and renderer adapters. Model-free, testable, CI-usable. |
| **Skill** | `SKILL.md` + `references/` + `assets/` (Agent Skills spec) | Teaches the model the authoring process, then calls the CLI. |
| **Extension** | pi extension, **optional** | Thin adapter: enforcement, native tools, commands. |

**The boundary rule (non-negotiable):** all rules live in the core. The skill and
the extension may *invoke* the core and *block* on its result, but must never
reimplement a rule. A rule that exists in two places will drift — that is exactly
how the original `spec.md` failed.

**Definition of the core in one sentence:** *a validated, renderer-agnostic
content spec in, renderer-native sources and a diagram out, with a gate in
between.*

## 3. Naming and layout

- Repo / project dir: **`diagram-spec`**
- CLI binary: **`dspec`**
- Skill name: **`diagram-spec`**

```
diagram-spec/
  src/schema.ts            # types + runtime schema for diagram-content.yaml
  src/validate.ts          # the gate (pure, no I/O beyond reading YAML)
  src/plan.ts             # view -> renderer selection + capability check
  src/emit.ts             # renderer-agnostic orchestration
  src/renderers/           # one adapter per renderer; see §7
  src/cli.ts               # `dspec init|validate|plan|emit|render`
  assets/diagram-content.yaml   # skeleton emitted by `dspec init`
  references/content-checklist.md  # the human-readable rules (F1–F7 as requirements)
  SKILL.md                 # installed to the skill dir; generated/copied from this repo
  bin/dspec
  test/
```

Publish the skill **from** this repo (build/copy step). The repo is the source of
truth; an installed `~/.pi/agent/skills/diagram-spec/` copy must never be edited
in place.

## 4. The artifact: `diagram-content.yaml`

This replaces prose `spec.md`. It is the single source; renderer DSLs are
**generated from it**, never hand-maintained (see §5). The schema must be
**generic** — it describes any system, and must not hardcode this project's or
any project's vocabulary.

```yaml
meta:
  title: string
  subtitle: string
  # Evidence the content was derived from, not invented. Validator requires >=1.
  source_of_truth: [path, ...]
  # F4: declared, not left to the engine.
  reading_direction: top-down | left-right

# F7: behaviour is mandatory; deployment is optional and secondary.
views:
  - id: behaviour
    kind: sequence | state      # F3: a kind capable of showing iteration
    caption: string
  - id: deployment
    kind: component
    caption: string

# F1: every distinct participant, named. No "peers" catch-all.
# `kind` drives placement; `renders_as` lets one actor appear in several views.
actors:
  - { id: string, label: string, role: string, kind: human | service | store | actor }

# F2: the real interaction vocabulary, declared by the author (not fixed by the tool).
# The validator checks every message label against `vocabulary`.
vocabulary:
  - { label: string, kind: control | report | query | verdict | data, symmetric: bool }

messages:
  - { from: actorId, to: actorId, label: <vocabulary label>, view: behaviour }

# F2/F3: the cycle. The thing most often missing.
loops:
  - { id: string, over: [actorId...], exit: string, view: behaviour }

# F2: how the run ends, explicitly.
terminal:
  - { actor: actorId, action: string, produces: [artifact] }

# F5/F6: bands are defined by membership, not just named.
bands:
  - { id: string, label: string, membership: [actorId...], definition: string, view: ... }

# F5: required for every view that uses more than one flow class.
legend:
  - { class: <vocabulary kind>, meaning: string }

# Not a hardcoded choice (§7). Optional; `dspec plan` proposes one.
renderers:
  behaviour:  { adapter: string, fallback: string }
  deployment: { adapter: string }
```

### Schema rules that directly prevent the known failures

- **A behaviour view is mandatory**, and its `kind` must be `sequence` or `state`.
  If a chosen renderer cannot express a cycle, that is a *renderer-selection*
  failure — never a reason to drop the view.
- **`loops[].exit` is required** — an unbounded loop is not a depiction, it is a
  guess. This is the fix for "repetition until DoD" being invisible.
- **Bands must not merge transport with actors.** A band whose label joins two
  concepts with a separator (e.g. `"Bus · peers"`) is rejected; the transport and
  the participants are separate bands with separate memberships. This single
  prohibition is what made the peer behaviour invisible originally.
- **Every label in `messages` must appear in `vocabulary`** — no free-text arrows.
- **`meta.source_of_truth` must be non-empty** — the content must be traceable to
  something inspectable, not invented.

## 5. One source, N renderers (fixes drift)

Renderer DSLs are **generated**, not authored:

```
diagram-content.yaml ──dspec validate──▶ gate
                     ──dspec emit─────▶ <adapter>.emit(spec, view)
                     ──dspec render───▶ generated DSL (optional) ──▶ SVG/PNG
```

Generated DSL files carry a header: `# generated by dspec from diagram-content.yaml — do not edit`.
They may be committed for reproducibility, but the YAML is always the input.

This eliminates the failure seen in the reference case, where six hand-written
DSLs drifted from one source (minor label wording diverged across five of them).

## 6. The gate (`dspec validate`)

Pure, deterministic, no network, no model, target < 100 ms. Non-zero exit and no
render when any of these fail:

1. no view with `kind: sequence|state`;
2. a behaviour view whose kind cannot express iteration;
3. fewer than 2 actors, or any actor without `role`;
4. no `loops[]` entry, or one lacking `exit`;
5. `meta.reading_direction` unset;
6. `legend` missing, or fewer than 2 classes, on a multi-flow view;
7. any `bands[]` entry with empty `membership` or a transport+actor label;
8. any `messages[].label` not in `vocabulary`;
9. `meta.source_of_truth` empty;
10. a `renderers.*` adapter that does not declare the capability the view needs.

Human-readable errors only (path + reason), mirroring the style already used by
this repo's `session.yaml` validator.

## 7. Renderer abstraction (deliberately not D2)

Renderers are **adapters**, resolved by id. No adapter is privileged in the core;
the tool must work with whichever is configured, and must degrade to a clear
error when a configured adapter cannot express a view.

```ts
export interface RendererAdapter {
  id: string;
  // Declared, so `dspec plan` can refuse an incompatible pairing before emitting.
  capabilities: {
    sequence: "native" | "approximable" | "no";
    state: "native" | "approximable" | "no";
    component: "native";
    deterministic: boolean;      // no model, no network
    requiresRuntime?: string;    // e.g. "chromium", "python3"
  };
  // Pure: content -> renderer-native source text. No I/O.
  emit(spec: DiagramContent, view: View): { path: string; contents: string }[];
  // Impure: invoke the external tool. May be skipped (emit-only mode).
  render?(files: { path: string; contents: string }[], outDir: string): Promise<Artifact[]>;
}
```

Capability matrix to seed the adapters (native / approximable / no). Verify each
claim against the installed tool at implementation time; do not trust this table
as fact. Measured results, with the commands that show them, are recorded in
`docs/adapter-findings.md` and supersede this table where they disagree:

| Adapter | sequence | state | component | Runtime |
|---|---|---|---|---|
| mermaid | native | native | native | node + headless browser |
| graphviz (dot) | approximable | native | native | dot binary or WASM |
| d2 | native | native | native | single self-contained binary |
| excalidraw | approximable | approximable | native | node + headless browser |
| svg (hand-authored) | native (manual) | native (manual) | native (manual) | none |
| fireworks-tech-graph | no | approximable | native | python3 |

Selection is **data, not code**: `renderers:` in the content spec, with
`dspec plan` proposing a pairing from `capabilities` and refusing invalid ones.
A renderer with `deterministic: false` must be rejected for CI use.

Measured input for selection (from a prior six-renderer comparison; single
machine, median of 3, no model involved — treat as indicative, re-measure):

- D2 (Go binary): 20 ms, no runtime deps.
- Graphviz (WASM): 36 ms.
- fireworks (python3): ~1.4 s.
- Mermaid (npx + Chromium): ~1.7 s.
- Excalidraw (npx + Chromium): ~2.1 s.
- SVG→PNG rasterisation via headless Chromium: ~5.5 s for five SVGs.

## 8. The skill

Routing is the hard part: two installed skills (`excalidraw-diagram`,
`fireworks-tech-graph`) already claim "make a diagram" and are *rendering*
skills. This skill is about **content**, and its description must say so.

Suggested frontmatter:

```yaml
---
name: diagram-spec
description: >-
  Author and validate the content of a system/architecture diagram before drawing
  it: actors, the behaviour loop, message vocabulary, bands, legend, reading
  direction. Use for "architecture diagram", "system diagram", "draw how this
  works", "diagram the flow". Produces diagram-content.yaml and calls dspec;
  delegates rendering to a renderer adapter.
---
```

Process the skill must enforce, in order:

1. Identify **actors and roles** from the source, not from the request wording.
2. Identify the **behaviour**: who initiates, round trips, the loop, the exit.
3. Record **`source_of_truth`** — the files the content came from.
4. Choose a behaviour view `kind` that can show iteration.
5. Author `diagram-content.yaml` from `assets/diagram-content.yaml`.
6. Run `dspec validate`. **Do not render on failure** — fix the content.
7. Run `dspec plan` to pick an adapter; refuse a pairing that can't express the view.
8. `dspec emit` / `dspec render`.
9. Inspect the render against `references/content-checklist.md` — the gate checks
   structure, not meaning.

References to ship: `content-checklist.md` (the rules, human-readable),
one short example per view kind, and a note that renderer choice is downstream.

## 9. The pi extension (thin adapter only)

Justification — four things a skill structurally cannot do:

- **Enforcement.** Hook the tool call and refuse a render whose content does not
  validate. A skill can ask; only a hook can block.
- **No routing luck.** Skill loading is best-effort by design; a registered
  command/tool is not.
- **Typed tools.** Native parameters/results instead of shell string-building,
  and the ability to gate existing diagram-skill invocations at the call site.
- **UX.** Validation failures as notifications; pinned skill versions.

Rules for the extension:

- It **spawns `dspec`** and renders its output. It contains no schema, no rule
  list, no renderer knowledge.
- If `dspec` is missing, it fails loudly and points at the install command.
- Everything it does must remain optional: `dspec` + skill must be fully usable
  without pi.

## 10. House-style rules (enforced, not suggested)

| Rule | Why |
|---|---|
| Reading direction declared **and verified by inspecting the render** | One renderer silently laid the flow out right-to-left despite a top-down request |
| Legend on every multi-flow view | Only one of six prior diagrams had one |
| Bands carry `definition` + `membership` | Labels existed; membership did not |
| Transport and actors in separate bands | `"Bus · peers"` hid the peer behaviour |
| Real message vocabulary on every arrow | "control" on everything made flows indistinguishable |
| Terminal step explicit | "finalize → artifacts" was the whole point and was absent |

## 11. Requirements traceability

| Finding | Requirement | Enforced by |
|---|---|---|
| F1 no actors; peers collapsed | `actors[]` required, ≥2, each with a role | validator (`dspec validate`) |
| F2 no loop / repetition / exit | `views[behaviour]` mandatory; `loops[].exit` required | schema + validator |
| F3 no sequence/state view | behaviour `kind` ∈ {sequence,state} | validator + `dspec plan` |
| F4 direction unpinned | `meta.reading_direction` required; verify render | validator + skill step 9 |
| F5 legend missing | `legend[]` required on multi-flow views | validator |
| F6 bands merged transport+actors | band label/membership rule | validator |
| F7 components-only artifact | two-view model; deployment secondary | schema + validator |
| Drift across hand-written DSLs | DSLs generated from the YAML | `dspec emit` + generated header |
| Content invented / stale | `meta.source_of_truth` required | validator |

## 12. Open decisions for the fresh session

1. **Language/runtime for the core.** A Bun/TS core matches the pi and skill
   ecosystem; `bun build --compile` yields a dependency-free binary. Confirm.
2. **Schema enforcement.** A runtime schema library (e.g. zod) vs a hand-rolled
   checker. The repo this came from uses zod; a zero-dep checker keeps `dspec`
   installable anywhere.
3. **Which adapters ship in v1.** Recommend the two that cover both view kinds
   with the least runtime weight, plus one sequence-native adapter. Do not ship
   all six.
4. **Does `dspec plan` auto-select, or only refuse invalid pairings?** Recommend
   refuse-only for v1 (selection stays author-controlled and reviewable).
5. **Are generated DSLs committed?** Recommend yes, with the do-not-edit header.
6. **Extension scope for v1.** Recommend: one command + one blocking hook, no more.
7. **Skill distribution.** Build step that copies `SKILL.md` + references into the
   target skill dir; confirm the target location(s).
8. **Name check.** `diagram-spec` / `dspec` / skill `diagram-spec` — confirm no
   collision with installed skills or known binaries before publishing.

## 13. Acceptance criteria (DoD for the build)

1. `dspec validate` rejects every one of the ten conditions in §6, each with a test.
2. `dspec validate` accepts a valid two-view spec and exits 0.
3. `dspec emit` produces renderer-native sources containing the declared actors,
   all `messages`, exactly one loop with its `exit`, and a legend — for at least
   two different adapters, from the same YAML.
4. `dspec plan` refuses a behaviour view paired with an adapter whose
   `capabilities.sequence|state` is `no`.
5. Re-running `dspec emit` on unchanged input produces byte-identical output
   (determinism).
6. The same `diagram-content.yaml` renders through two adapters and both outputs
   contain every actor and the loop (renderer-agnosticism is proven, not claimed).
7. The validation gate catches a hand-built components-only spec — i.e. the
   original failure mode is now impossible to render without editing the spec.
8. `dspec` runs with no network and no model, and the validator completes < 100 ms.
9. The skill loads and its process produces a validating spec from a plain-English
   request about an unfamiliar system.
10. The pi extension blocks a render when `dspec validate` fails, and contains no
    duplicated rule logic.

## 14. Non-goals

- Drawing pretty pictures. Aesthetics stay with the existing rendering skills;
  `diagram-spec` owns **content**.
- Being a renderer. `diagram-spec` does not attempt layout quality or aesthetics.
  The hand-authored `svg` adapter stays, but only as a fixed-grid template: two
  hard-coded grids (sequence, node) plus an orientation switch driven by
  `meta.reading_direction`. It measures no text, wraps no label, routes no edge and
  makes no aesthetic choice. It exists so the adapter interface and
  renderer-agnosticism can be proven with no runtime at all; rendering quality is d2's
  and mermaid's job. Evidence in `docs/adapter-findings.md`.
- Replacing `excalidraw-diagram` / `fireworks-tech-graph`; it sits upstream of them.
- Model-assisted layout. Every stage must be reproducible without an LLM.
- Project-specific vocabulary. The A2A event names cited in the reference case are
  that project's data, declared in `vocabulary:` — never built into the tool.

## 15. Reference case (the evidence)

The findings above come from one concrete exercise: six renderers were each given
the same node/edge/label set for a supervisor/peers system. All six rendered
successfully; all six answered only the deployment question. Verified facts from
that exercise:

- `grep` of the shared content source: `dev_a`, `dev_b`, `relay`, `loop`, `repeat`,
  `steer`, `attest` — **0 occurrences each**.
- Only 1 of 6 rendered SVGs contained a legend.
- The canonical behaviour already existed in that repo's own spec (a lifecycle
  section and a "continue the loop" section) and was never used — the failure was
  in the diagram content, not in the available information.
- One adapter's output placed the control container to the **right** of the
  execution container (x≈979 vs x≈360), so its flow read right-to-left.

Keep this case as the acceptance test: `diagram-spec` should make it impossible to
ship a diagram of that system that shows no actors and no loop.
