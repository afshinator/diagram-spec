# Adapter findings

Capability claims are measured, not assumed. `docs/diagram-spec-bootstrap.md` §7 is a
seed table written before any tool was run; this file records what the installed
tools actually do, with the command that shows it. Where the two disagree, this file
wins and the code follows it.

Evidence was captured by hand on the machine described below. Re-run the commands to
reproduce; nothing here depends on a model or a network fetch.

## Environment

| Item | Value |
|---|---|
| `d2` | v0.9.0, `/opt/homebrew/bin/d2` |
| `mermaid-cli` | v11 via `npx -y @mermaid-js/mermaid-cli@11`, rendering with the locally installed Chrome (`PUPPETEER_EXECUTABLE_PATH`), so no browser download |
| platform | macOS, arm64 |

## d2

### `sequence` is native

§7's seed table originally listed d2 `sequence` as `approximable`; the row now reads
`native` because of this measurement. d2 renders a real sequence diagram —
participant headers, ordered messages with arrow heads, and loop frames.

```
$ printf 'shape: sequence_diagram\nsup: Supervisor\na: dev_a\ngroup: "work-loop" {\n  sup -> a: dispatch\n  a -> sup: report\n}\n' > seq.d2
$ d2 seq.d2 seq.svg
success: successfully compiled seq.d2 to seq.svg in 13.5ms
$ grep -o 'viewBox="0 0 [0-9]* [0-9]*"' seq.svg
viewBox="0 0 461 539"     # the same two messages without the group: viewBox="0 0 461 508"
$ grep -o '<text[^>]*>work-loop</text>' seq.svg
<text x="71" y="196" ...>work-loop</text>
```

The loop label sits at `y=196`, below the actor row at `y=90.5`, and the frame adds
vertical space. That is a loop frame wrapped around the messages, not a column:
contrast the phantom-column findings below, where a stray label lands on the actor row.

`span:` is **not** a sequence keyword. Used in a sequence diagram it behaves exactly
like the phantom column described below, so the adapter emits `group:` and never
`span:`.

`state` and `component` are also native, as the seed table says. All three shipped
adapters therefore declare `native` for every view kind.

### `title:` becomes a phantom participant column

A sequence diagram has no title field. d2 accepts `title:` as a node, so it draws the
title as a participant box on the header row with its own lifeline:

```
$ printf 'shape: sequence_diagram\ntitle: Behaviour\nsup -> a: dispatch\na -> sup: report\n' > t.d2
$ d2 t.d2 t.svg
$ grep -o '<text[^>]*y="90.5"[^>]*>[^<]*</text>' t.svg | sed 's/<[^>]*>//g'
Behaviour      x=68.5     <- the title, on the participant row
sup            x=219
a              x=369
$ grep -o 'M 68.5 120 L 68.5 357' t.svg
M 68.5 120 L 68.5 357     <- and it has a lifeline
```

Consequence: the adapter never emits `title:` inside a sequence diagram. The title is
written as a comment plus a `note over` line instead (see the next finding for the
cost of that choice).

### `note over` also adds a column and a lifeline

Same trap, different syntax. Two participants plus one `note over sup, a` produce
three lifelines, and the note sits in the third:

```
$ printf 'shape: sequence_diagram\nsup -> a: dispatch\na -> sup: report\nnote over sup, a: "Behaviour"\n' > n.d2
$ d2 n.d2 n.svg
$ grep -o 'M [0-9.]* 120 L [0-9.]* 357' n.svg
M 62 120 L 62 357
M 212 120 L 212 357
M 362.5 120 L 362.5 357   <- third lifeline, from the note; only 2 participants exist
```

Consequence: a d2 sequence render currently shows legend and loop notes as extra
columns. Whether d2 offers a header-free annotation in sequence diagrams is unproven;
tracked as its own issue rather than silently tolerated.

### Block strings reject markdown table rows

A `|md` block is terminated by a line that starts with `|`, so a markdown table
cannot be used for the legend:

```
$ printf 'a: x\nb: y\nlegend: L {\n  label: |md\n    | class | meaning |\n    |---|---|\n  |\n}\na -> b: m\n' > md.d2
$ d2 md.d2 md.svg
err: failed to compile md.d2: md.d2:5:6: unexpected text after md block string.
```

Consequence: the legend is emitted as plain text nodes, one per class.

### `direction:` is only honoured when blocks are linked

Containers that no edge connects are laid out side by side, and `direction: down` does
not move them into a column:

```
$ d2 direction-unlinked.d2 unlinked.svg   # two containers, no edge between them
$ d2 direction-linked.d2   linked.svg     # same, plus c1 -> c2 with opacity 0
$ grep -o 'viewBox="0 0 [0-9]* [0-9]*"' unlinked.svg linked.svg
viewBox="0 0 720 368"    # landscape row: direction ignored
viewBox="0 0 515 634"    # portrait stack: direction honoured
```

Consequence: the graph adapter chains its blocks with a zero-opacity, zero-width edge
so a declared reading direction actually reaches the layout.

## mermaid

### Frontmatter must be on line 1

A comment above `---` breaks parsing:

```
$ mmdc -i comment-first.mmd -o out.svg
Error: Parse error on line 1:
Expecting 'SPACE', 'NEWLINE', 'SD', got '-'
```

Consequence: the generated `.mmd` puts frontmatter first and the do-not-edit comment
immediately after it.

### `Note over A,B` accepts exactly two participants

Three is a parse error:

```
$ mmdc -i note-three.mmd -o out.svg
Error: Parse error on line 6:
Expecting 'TXT', got ','
```

Consequence: the legend note spans only the two outermost participants.

### Emit-only, by choice

`mmdc` is reached through `npx` and drives a browser. Running it inside `dspec` would
put a network install inside a tool whose contract is no network, so the mermaid
adapter emits `.mmd` and stops. Use a renderer skill or a local `mmdc` to rasterise.

## svg

No runtime at all: the emitted `.svg` file is the artifact. This is what makes the
two-adapter acceptance test runnable on a machine without `d2` or Chrome, and it is
also why the adapter's scope is tracked as open issue #7.

## Not measured here

- **d2 SVG bytes across machines.** The rendered SVG embeds `data-d2-version`, so only
  `dspec emit` output is committed under `generated/` and drift-checked.
- **Render times.** Selection is based on capability and runtime weight, not speed.
