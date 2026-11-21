# diagram-spec

Validated, renderer-agnostic diagram content. One `diagram-content.yaml` in;
renderer-native sources and a diagram out, with a gate in between.

The problem it fixes: "draw the architecture" reliably produces a component
diagram — boxes and plumbing — that answers *what exists* and silently omits *who
talks to whom, in what order, until when*. The defect is in the authoring artifact,
not the renderer, so the artifact is what gets a schema and a validator.

```sh
bun install
bun src/cli.ts init .                 # skeleton diagram-content.yaml
bun src/cli.ts validate diagram-content.yaml
bun src/cli.ts plan diagram-content.yaml
bun src/cli.ts render diagram-content.yaml --out out
```

`dspec` is model-free, network-free and deterministic: no LLM call, no fetch, no
telemetry, no postinstall. Install the CLI as a binary with
`bun run build` (produced by `bun build --compile`), or run it with `bun src/cli.ts`.

## Commands

| Command | Does |
|---|---|
| `dspec init [dir]` | write the `diagram-content.yaml` skeleton (refuses to overwrite) |
| `dspec validate <file>` | the gate: path + reason per failure, exit 1, no render |
| `dspec plan <file>` | resolve view → adapter; refuses a pairing that cannot express the view |
| `dspec emit <file> --out dir` | write renderer-native sources, each with a do-not-edit header |
| `dspec render <file> --out dir` | emit, then render where the adapter can invoke its tool |
| `dspec adapters` | declared capabilities per adapter |

## Adapters in v1

| adapter | sequence | state | component | render | runtime |
|---|---|---|---|---|---|
| `d2` | native | native | native | yes, to SVG | the `d2` binary |
| `mermaid` | native | native | native | no, emit-only | `mmdc` (node + chromium) if you want SVG |
| `svg` | native (manual) | native (manual) | native (manual) | writes SVG | none |

The `svg` adapter is a fixed-grid template, not a general renderer: two hard-coded
grids plus an orientation switch from `meta.reading_direction`, with no text
measurement, no label wrapping and no edge routing. It exists so the adapter
interface and renderer-agnosticism stay provable with no runtime at all. Rendering
quality belongs to `d2` and `mermaid`.

Capabilities are measured, not assumed. The seed table in
`docs/diagram-spec-bootstrap.md` §7 predates any tool being run; the measurements,
commands and observed output that decide each claim live in
`docs/adapter-findings.md`, and `dspec adapters` prints the live declaration.
Selection lives in the YAML (`renderers:`), and `dspec plan` refuses an invalid
configured pairing rather than selecting another adapter.

## Layout

```
src/schema.ts        zod schema for diagram-content.yaml
src/validate.ts      the gate: ten rejections plus reference integrity
src/plan.ts          view -> adapter resolution and capability refusal
src/emit.ts          orchestration; deterministic output
src/renderers/       d2, mermaid, svg adapters + shared helpers
src/cli.ts           dspec init|validate|plan|emit|render|adapters
assets/              diagram-content.yaml skeleton emitted by `dspec init`
examples/            a two-view example and a state-kind example
references/          content-checklist.md — the human inspection rules
SKILL.md             agent skill: content authoring, never rendering
```

## Checks

```sh
bun run typecheck
bun run test
bun run generated   # regenerate committed renderer DSLs
bun run check       # typecheck + tests + generated drift check + fallow audit
```

## Generated files

`generated/` holds renderer-native DSL produced by `dspec emit` from the fixtures in
`examples/`, one directory per fixture. Each file carries the adapter's
do-not-edit header. The YAML is authoritative: edit the YAML, then run
`bun run generated` and commit both. Hand edits to `generated/` are unsupported and
fail `bun run check`, which verifies every committed file byte-for-byte against
fresh output and reports missing, changed and stale files.

## The skill

`SKILL.md` + `references/` + `assets/` are the skill. Copy them into a skill
directory (`~/.agents/skills/diagram-spec/` or `~/.pi/agent/skills/diagram-spec/`)
when publishing; edit them here, never in the installed copy. The skill owns
*content*; rendering stays with a renderer adapter or a diagram-drawing skill.
