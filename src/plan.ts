import type { DiagramContent, View } from "./schema.ts";
import { byCodeUnit } from "./schema.ts";

export type Capability = "native" | "approximable" | "no";

export type EmitFile = { path: string; contents: string };
export type Artifact = { path: string; bytes: number };

export interface RendererAdapter {
  id: string;
  /** Declared, so a pairing can be refused before anything is emitted. */
  capabilities: {
    sequence: Capability;
    state: Capability;
    component: Capability;
    deterministic: boolean;
    requiresRuntime?: string;
  };
  /** Pure: content -> renderer-native source text. No I/O. */
  emit(spec: DiagramContent, view: View): EmitFile[];
  /** Impure: invoke the external tool. Absent when the adapter is emit-only. */
  render?(files: EmitFile[], outDir: string): Promise<Artifact[]>;
}

export type Registry = Record<string, RendererAdapter>;
/**
 * The single place where "can this adapter draw this view" is decided.
 * Validator and plan both call it, so the rule cannot drift.
 */
function pairingProblem(
  id: string,
  adapter: RendererAdapter | undefined,
  view: View,
): { code: string; reason: string } | null {
  if (!adapter) return { code: "adapter-capability-missing", reason: `adapter '${id}' is not installed` };
  if (!adapter.capabilities.deterministic) {
    return { code: "adapter-not-deterministic", reason: `adapter '${adapter.id}' is not deterministic` };
  }
  const capability = adapter.capabilities[view.kind];
  if (capability === "no") {
    return {
      code: "adapter-capability-missing",
      reason: `adapter '${adapter.id}' declares capabilities.${view.kind} = no`,
    };
  }
  return null;
}

export type PlanEntry = {
  view: View;
  adapter?: RendererAdapter;
  capability?: Capability;
  refused?: { code: string; reason: string };
};

export type Plan = { entries: PlanEntry[]; ok: boolean };

function selectedEntry(view: View, adapter: RendererAdapter): PlanEntry {
  return { view, adapter, capability: adapter.capabilities[view.kind] };
}

/** Resolve one view to an adapter. Refuses invalid pairings; never auto-selects. */
export function resolveView(view: View, spec: DiagramContent, registry: Registry): PlanEntry {
  const choice = spec.renderers[view.id];
  if (!choice) {
    return { view, refused: { code: "no-renderer-configured", reason: `renderers.${view.id} is not set` } };
  }
  const selected = registry[choice.adapter];
  const problem = pairingProblem(choice.adapter, selected, view);
  if (problem) return { view, refused: problem };
  return selectedEntry(view, selected!);
}

/** Resolve every view to an adapter, in a deterministic order. */
export function plan(spec: DiagramContent, registry: Registry): Plan {
  const entries = [...spec.views]
    .sort((a, b) => byCodeUnit(a.id, b.id))
    .map((view) => resolveView(view, spec, registry));
  return { entries, ok: entries.every((entry) => !entry.refused) };
}

export function describePlan(result: Plan): string[] {
  return result.entries.map((entry) => {
    if (entry.refused) return `${entry.view.id} (${entry.view.kind}): refused — ${entry.refused.reason}`;
    return `${entry.view.id} (${entry.view.kind}): ${entry.adapter?.id} — ${entry.capability}`;
  });
}
