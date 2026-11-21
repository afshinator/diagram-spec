---
name: diagram-spec
description: >-
  Author and validate the content of a system or architecture diagram before
  drawing it: actors, the behaviour loop and its exit, message vocabulary, bands,
  legend, reading direction. Use for "architecture diagram", "system diagram",
  "draw how this works", "diagram the flow", "who talks to whom". This skill is
  about content, not rendering: it produces diagram-content.yaml, and rendering
  stays with a renderer adapter (d2, mermaid, svg) or another diagram skill.
---

# diagram-spec

A diagram of a system that shows only boxes and arrows answers "what runs where"
and silently omits "what happens". This skill makes the authoring artifact carry the
behaviour first, then proves it with `dspec validate` before anything is drawn.

**Boundary rule:** `dspec validate` is the only authority on what a valid artifact
looks like. This skill never lists, repeats or checks a rule itself — it runs the
gate, reads its `path: reason` output, and fixes the content. If `dspec` is not
installed, stop and say so; do not substitute your own review for the gate.

## When this applies

Use it for requests to explain how a system behaves, in words like "architecture
diagram", "system diagram", "flow", "sequence", "who talks to whom".

Do not use it to make a picture pretty. Layout, style and export belong to a
rendering skill; this one owns what the picture is allowed to say.

## Process

1. **Actors and roles from the source, not the request.** Read the files the system
   actually lives in and list every distinct participant. Never collapse several
   participants into "peers". Write what each one decides.
2. **Behaviour before structure.** Find who initiates, what comes back, what repeats,
   and what stops the repetition. If the source does not state the exit condition,
   ask for it; do not invent one.
3. **Record `meta.source_of_truth`.** Every file the content came from. No evidence,
   no diagram.
4. **Pick the behaviour shape the content actually has:** chronological interaction
   is a `sequence` view, a lifecycle of one participant is a `state` view. Judging
   which kinds are admissible is the gate's job, not this list's — if the choice is
   wrong, `dspec validate` says so in `views[i].kind` terms.
5. **Author `diagram-content.yaml`** from `assets/diagram-content.yaml`. Write the
   vocabulary before the messages, and use those labels for every arrow.
6. **Gate it:** `dspec validate diagram-content.yaml`. On failure, read `path:
   reason`, fix the content, re-run. Never proceed while it exits non-zero.
7. **Resolve the pairing:** `dspec plan diagram-content.yaml`. The renderer is
   declared in the YAML (`renderers:`); this command refuses a pairing that cannot
   express the view. Do not silently pick a different adapter.
8. **Emit and render:** `dspec emit diagram-content.yaml --out out` for the
   renderer-native sources, `dspec render ...` where the adapter can invoke its
   tool. Generated files are never edited by hand: they carry a header saying so.
9. **Inspect the render against `references/content-checklist.md`.** The gate proves
   structure; you prove meaning. That checklist is about what a reader can conclude,
   never about re-checking what the gate already proved.

## Commands

```sh
dspec init .                     # skeleton diagram-content.yaml
dspec validate diagram-content.yaml
dspec plan diagram-content.yaml
dspec emit diagram-content.yaml --out out
dspec render diagram-content.yaml --out out
dspec adapters                   # declared capabilities, measured not assumed
```

## What the gate is for

The failure this skill exists to prevent is an artifact that looks competent and
says nothing about behaviour: no named participants, no repetition, no exit
condition, one undifferentiated arrow class, no legend, direction left to the
engine. Those are structural, so they are enforced in one place — the gate — and
the fix is always to edit the YAML until `dspec validate` exits 0, never to argue
with the diagram.

Worked starting points live in `examples/` (`peer-system.yaml` for a two-view
sequence case, `state-machine.yaml` for a state-kind behaviour view) and in
`references/examples.md`.
