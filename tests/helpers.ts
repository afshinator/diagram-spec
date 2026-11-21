import type { DiagramContent } from "../src/schema.ts";
import type { RendererAdapter } from "../src/plan.ts";

/** A spec that must pass. Tests break exactly one property at a time. */
export function validSpec(): DiagramContent {
  return {
    meta: {
      title: "Supervisor and peers",
      subtitle: "who talks to whom, until when",
      source_of_truth: ["docs/peer-lifecycle.md"],
      reading_direction: "top-down" as const,
    },
    views: [
      { id: "behaviour", kind: "sequence" as const, caption: "who talks to whom, in what order" },
      { id: "deployment", kind: "component" as const, caption: "what runs where" },
    ],
    actors: [
      { id: "supervisor", label: "Supervisor", role: "dispatches work, owns the DoD", kind: "service" as const },
      { id: "dev_a", label: "dev_a", role: "implements, reports back", kind: "human" as const },
      { id: "dev_b", label: "dev_b", role: "implements, reports back", kind: "human" as const },
    ],
    vocabulary: [
      { label: "dispatch", kind: "control" as const, symmetric: false },
      { label: "report", kind: "report" as const, symmetric: false },
      { label: "verdict", kind: "verdict" as const, symmetric: false },
    ],
    messages: [
      { from: "supervisor", to: "dev_a", label: "dispatch", view: "behaviour" },
      { from: "dev_a", to: "supervisor", label: "report", view: "behaviour" },
      { from: "dev_b", to: "supervisor", label: "report", view: "behaviour" },
    ],
    loops: [
      {
        id: "peer-loop",
        over: ["supervisor", "dev_a", "dev_b"],
        exit: "every peer reported and the verdict is accepted",
        view: "behaviour",
      },
    ],
    terminal: [{ actor: "supervisor", action: "publish artifacts", produces: ["plan.md", "evidence.md"] }],
    bands: [
      { id: "control", label: "control plane", membership: ["supervisor"], definition: "the scheduler", view: "deployment" },
      { id: "peers", label: "peers", membership: ["dev_a", "dev_b"], definition: "the implementers", view: "deployment" },
    ],
    legend: [
      { class: "control" as const, meaning: "dispatch of work" },
      { class: "report" as const, meaning: "status back to the supervisor" },
    ],
    renderers: {
      behaviour: { adapter: "d2", fallback: "mermaid" },
      deployment: { adapter: "d2" },
    },
  };
}

export type Spec = DiagramContent;

/** A registry entry with a declared capability the shipped adapters do not have. */
export function fakeAdapter(overrides: Partial<RendererAdapter["capabilities"]> = {}): RendererAdapter {
  return {
    id: "fake",
    capabilities: {
      sequence: "native",
      state: "native",
      component: "native",
      deterministic: true,
      ...overrides,
    },
    emit: (spec, view) => [{ path: `${view.id}.txt`, contents: `${spec.meta.title}\n${view.id}\n` }],
  };
}

