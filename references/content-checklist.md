# Content checklist

The validator proves the **structure**. This list is what a reader proves: whether
the content is true, and whether a stranger could answer the system's questions
from the render. Run `dspec validate` first — a render is never inspected before it
passes the gate, and nothing here repeats what the gate already enforces.

## 1. Actors

- [ ] Every participant that appears in the source is a declared actor. Grep the
      source for each name; a name that appears there and not in `actors` is missing.
- [ ] No catch-all actor. If the source says "peers" or "the team", it is at least
      two actors, or it is one actor with a role that says so.
- [ ] Each `role` would let a stranger say what that actor decides, not what it is
      built with.

## 2. Behaviour and the loop

- [ ] The behaviour view answers: who starts, who replies, what repeats, what ends it.
- [ ] The repetition in the source is the declared `loops[]` entry — same trigger,
      same exit condition, no repeat left only in prose.
- [ ] `loops[].exit` is a condition a reader could test, not a hope ("until done").
- [ ] The terminal step names the thing the run exists to produce.
- [ ] Nothing in the deployment view is doing behaviour's job — no sequence arrows in
      a box diagram pretending to be order.

## 3. Evidence

- [ ] `meta.source_of_truth` lists files that exist and were actually read.
- [ ] No actor, message or loop is invented for completeness. If the source does not
      say it, it does not belong in the diagram.

## 4. Vocabulary

- [ ] Every arrow's label says what moved: a request, a status, a decision, data.
- [ ] Two edges a reader must distinguish carry different labels. One label on
      everything is the original defect, in a form the gate cannot detect.
- [ ] A class marked `symmetric` really travels both ways; otherwise the arrow heads
      claim a direction the source does not.

## 5. Bands and legend

- [ ] A reader can say which actors are inside each band and why — membership and
      definition agree with the source.
- [ ] The legend's meanings describe behaviour, not the class name restated.
- [ ] If transport is modelled, it appears as its own band with its own members.
      (Whether a label merges concepts is the gate's call; whether the split is
      *correct* is yours.)

## 6. Reading direction

- [ ] Open the render and check the flow reads the way `meta.reading_direction`
      declares. A render that contradicts the declaration is a failure even if the
      diagram is pretty.
- [ ] Nothing in the render reads right-to-left or bottom-up unless declared.

## 7. After the render

- [ ] Can a reader who has not read the source answer "who talks to whom, in what
      order, until when" from the picture alone?
- [ ] Is anything in the picture absent from the YAML? If so, it was drawn by hand,
      or an adapter invented it — either way it will drift; fix the adapter or the
      YAML.
- [ ] Does the picture contain an actor, stage or endpoint the source does not have?
      That is invention, and it is worse than an omission.
