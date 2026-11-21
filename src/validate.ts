import { byCodeUnit, iterable, parseValue, type DiagramContent } from "./schema.ts";
import { resolveView, type Registry } from "./plan.ts";
import { registry as shippedAdapters } from "./renderers/index.ts";

export type RuleError = { code: string; path: string; reason: string };
export type ValidationResult =
  | { ok: true; spec: DiagramContent; errors: [] }
  | { ok: false; spec: DiagramContent | null; errors: RuleError[] };

const TRANSPORT_SEPARATORS = ["·", "•", "|", "/", "&", "+", ",", " vs ", " — ", " - "];

type Emit = (code: string, path: string, reason: string) => void;
type Rule = (spec: DiagramContent, push: Emit) => void;

/** 1 + 2: a behaviour view must exist, and it must be able to iterate. */
const behaviourRules: Rule = (spec, push) => {
  if (!spec.views.some((view) => iterable(view.kind))) {
    push("behaviour-view-missing", "views", "no view with kind sequence|state: a diagram of parts cannot show what the system does");
  }
  const flowViews = new Set([...spec.messages.map((message) => message.view), ...spec.loops.map((loop) => loop.view)]);
  spec.views.forEach((view, index) => {
    if (flowViews.has(view.id) && !iterable(view.kind)) {
      push(
        "behaviour-kind-cannot-iterate",
        `views[${index}]`,
        `view '${view.id}' carries messages or loops but kind '${view.kind}' cannot express iteration`,
      );
    }
  });
};

/** 3: at least two named actors, each with a role. */
const actorRules: Rule = (spec, push) => {
  if (spec.actors.length < 2) {
    push("actors-too-few", "actors", `found ${spec.actors.length} actor(s), need at least 2: no 'peers' catch-all`);
  }
  spec.actors.forEach((actor, index) => {
    if (!actor.role?.trim()) push("actor-role-missing", `actors[${index}].role`, `actor '${actor.id}' has no role`);
  });
};

/** 4: a documented cycle, with a way out. */
const loopRules: Rule = (spec, push) => {
  if (spec.loops.length === 0) {
    push("loop-missing", "loops", "no loop declared: repetition and its exit condition are the behaviour");
  }
  spec.loops.forEach((loop, index) => {
    if (!loop.exit?.trim()) push("loop-exit-missing", `loops[${index}].exit`, `loop '${loop.id}' has no exit condition`);
    if (loop.over.length === 0) push("loop-participants-missing", `loops[${index}].over`, `loop '${loop.id}' has no participants`);
  });
};

/** 5: reading direction is a declared fact, not an engine default. */
const directionRule: Rule = (spec, push) => {
  if (!spec.meta.reading_direction) {
    push("reading-direction-missing", "meta.reading_direction", "unset: declare top-down or left-right, and verify the render agrees");
  }
};

const flowClassesOf = (spec: DiagramContent, viewId: string) =>
  new Set(
    spec.messages
      .filter((message) => message.view === viewId)
      .map((message) => spec.vocabulary.find((entry) => entry.label === message.label)?.kind)
      .filter(Boolean),
  );

/** 6: a view carrying more than one flow class needs a legend naming two of them. */
const legendRule: Rule = (spec, push) => {
  const multiFlow = spec.views.some((view) => flowClassesOf(spec, view.id).size > 1);
  if (!multiFlow) return;
  if (spec.legend.length === 0) {
    push("legend-missing", "legend", "a view uses more than one flow class and no legend explains them");
  } else if (new Set(spec.legend.map((entry) => entry.class)).size < 2) {
    push("legend-fewer-than-two-classes", "legend", "a view uses more than one flow class, the legend names fewer than two");
  }
};

/** 7: bands are memberships with definitions, never transport glued to actors. */
const bandRules: Rule = (spec, push) => {
  spec.bands.forEach((band, index) => {
    if (band.membership.length === 0) {
      push("band-membership-empty", `bands[${index}].membership`, `band '${band.id}' has no members`);
    }
    if (!band.definition?.trim()) {
      push("band-definition-missing", `bands[${index}].definition`, `band '${band.id}' has no definition`);
    }
    const separator = TRANSPORT_SEPARATORS.find((candidate) => band.label.includes(candidate));
    if (separator) {
      push(
        "band-label-merges-concepts",
        `bands[${index}].label`,
        `band label '${band.label}' joins two concepts with '${separator.trim()}': transport and actors are separate bands`,
      );
    }
  });
};

/** 8: no free-text arrows. */
const messageRules: Rule = (spec, push) => {
  const declared = new Set(spec.vocabulary.map((entry) => entry.label));
  spec.messages.forEach((message, index) => {
    if (!declared.has(message.label)) {
      push("message-label-not-in-vocabulary", `messages[${index}].label`, `label '${message.label}' is not declared in vocabulary`);
    }
  });
};

/** The run must state how it ends and what it produces. */
const terminalRule: Rule = (spec, push) => {
  if (spec.terminal.length === 0) push("terminal-missing", "terminal", "no terminal step declares how the run ends");
};

/** 9: the content is traceable to something inspectable. */
const sourceRule: Rule = (spec, push) => {
  if (spec.meta.source_of_truth.every((entry) => !entry.trim())) {
    push("source-of-truth-missing", "meta.source_of_truth", "empty: name the files this content was derived from");
  }
};

/** 10: every configured pairing must be able to draw its view. */
const rendererRules = (adapters: Registry): Rule => (spec, push) => {
  for (const viewId of Object.keys(spec.renderers).sort(byCodeUnit)) {
    const view = spec.views.find((candidate) => candidate.id === viewId);
    if (!view) {
      push("dangling-reference", `renderers.${viewId}`, `renderers entry names no view '${viewId}'`);
      continue;
    }
    // One resolver for the whole product: validate, plan and emit cannot disagree.
    const refused = resolveView(view, spec, adapters).refused;
    if (refused) push(refused.code, `renderers.${viewId}`, refused.reason);
  }
};

/** Integrity: ids must be unique, or two views would write the same file. */
const identityRules: Rule = (spec, push) => {
  const check = (kind: string, ids: string[]) => {
    const seen = new Set<string>();
    ids.forEach((id, index) => {
      if (seen.has(id)) push("duplicate-id", `${kind}[${index}].id`, `duplicate ${kind} id '${id}'`);
      seen.add(id);
    });
  };
  check("views", spec.views.map((view) => view.id));
  check("actors", spec.actors.map((actor) => actor.id));
  check("loops", spec.loops.map((loop) => loop.id));
  check("bands", spec.bands.map((band) => band.id));
  check("vocabulary", spec.vocabulary.map((entry) => entry.label));
};

/** Integrity: a reference to something undeclared would emit a diagram of a fiction. */
const referenceRules: Rule = (spec, push) => {
  const actorIds = new Set(spec.actors.map((actor) => actor.id));
  const viewIds = new Set(spec.views.map((view) => view.id));
  const check = (path: string, key: string, known: Set<string>, what: string) => {
    if (!known.has(key)) push("dangling-reference", path, `${what} '${key}' is not declared`);
  };
  spec.messages.forEach((message, index) => {
    check(`messages[${index}].from`, message.from, actorIds, "actor");
    check(`messages[${index}].to`, message.to, actorIds, "actor");
    check(`messages[${index}].view`, message.view, viewIds, "view");
  });
  spec.loops.forEach((loop, index) => {
    loop.over.forEach((key, position) => check(`loops[${index}].over[${position}]`, key, actorIds, "actor"));
    check(`loops[${index}].view`, loop.view, viewIds, "view");
  });
  spec.terminal.forEach((entry, index) => check(`terminal[${index}].actor`, entry.actor, actorIds, "actor"));
  spec.bands.forEach((band, index) => {
    band.membership.forEach((key, position) => check(`bands[${index}].membership[${position}]`, key, actorIds, "actor"));
    if (band.view) check(`bands[${index}].view`, band.view, viewIds, "view");
  });
};

export function validate(raw: unknown, opts: { adapters?: Registry } = {}): ValidationResult {
  const parsed = parseValue(raw);
  if (!parsed.ok) {
    return { ok: false, spec: null, errors: parsed.errors.map((error) => ({ code: "schema", ...error })) };
  }
  const spec = parsed.spec;
  const errors: RuleError[] = [];
  const push: Emit = (code, path, reason) => errors.push({ code, path, reason });
  const rules: Rule[] = [
    behaviourRules,
    actorRules,
    loopRules,
    directionRule,
    legendRule,
    bandRules,
    messageRules,
    terminalRule,
    sourceRule,
    identityRules,
    rendererRules(opts.adapters ?? shippedAdapters),
    referenceRules,
  ];
  for (const rule of rules) rule(spec, push);
  return errors.length ? { ok: false, spec, errors } : { ok: true, spec, errors: [] };
}

export function formatErrors(errors: RuleError[]): string {
  return errors.map((error) => `${error.path}: ${error.reason}`).join("\n");
}
