# Examples

One short example per view kind. Renderer choice is downstream of all of this: the
same YAML emits through `d2`, `mermaid` or `svg`, and pairing lives in `renderers:`.

## `sequence` — a behaviour view with a cycle

Two participants, one loop, one exit, and a legend because two flow classes are in
play. Order is carried by the messages.

```yaml
views:
  - { id: behaviour, kind: sequence, caption: who asks, who answers, until when }
actors:
  - { id: requester, label: Requester, role: asks and accepts, kind: human }
  - { id: worker, label: Worker, role: works and reports, kind: service }
vocabulary:
  - { label: request, kind: control, symmetric: false }
  - { label: report, kind: report, symmetric: false }
messages:
  - { from: requester, to: worker, label: request, view: behaviour }
  - { from: worker, to: requester, label: report, view: behaviour }
loops:
  - { id: work-loop, over: [requester, worker], exit: the requester accepts, view: behaviour }
legend:
  - { class: control, meaning: work handed over }
  - { class: report, meaning: status coming back }
```

## `state` — a lifecycle, with the retry that repeats

Order is carried by transitions, so a cycle is a transition back to a state. The
loop's exit is the condition that leaves the cycle.

```yaml
views:
  - { id: behaviour, kind: state, caption: the lifecycle and its way out }
actors:
  - { id: operator, label: Operator, role: starts the run, kind: human }
  - { id: importer, label: Importer, role: parses, repairs, publishes, kind: service }
vocabulary:
  - { label: start, kind: control, symmetric: false }
  - { label: repair, kind: control, symmetric: false }
  - { label: reject, kind: verdict, symmetric: false }
messages:
  - { from: operator, to: importer, label: start, view: behaviour }
  - { from: importer, to: importer, label: repair, view: behaviour }
  - { from: operator, to: importer, label: reject, view: behaviour }
loops:
  - { id: repair-loop, over: [importer], exit: three attempts, or a clean parse, view: behaviour }
legend:
  - { class: control, meaning: an instruction that starts or repeats work }
  - { class: verdict, meaning: a decision that ends the run }
```

## `component` — deployment, secondary

Boxes and containment, no order. Bands are memberships with definitions; transport
gets its own band. This view never carries the behaviour.

```yaml
views:
  - { id: deployment, kind: component, caption: what runs where }
bands:
  - { id: control, label: control plane, membership: [supervisor], definition: owns the loop, view: deployment }
  - { id: peers, label: peers, membership: [dev_a, dev_b], definition: the implementers, view: deployment }
actors:
  - { id: supervisor, label: Supervisor, role: dispatches work, kind: service }
  - { id: dev_a, label: dev_a, role: implements one slice, kind: human }
  - { id: dev_b, label: dev_b, role: implements one slice, kind: human }
```

Complete, validated files: `examples/peer-system.yaml` (two views, sequence +
component) and `examples/state-machine.yaml` (state + component, and a pairing that
uses two different adapters).
