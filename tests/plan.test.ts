import { describe, expect, test } from "bun:test";
import { describePlan, plan } from "../src/plan.ts";
import { registry } from "../src/renderers/index.ts";
import { fakeAdapter, validSpec } from "./helpers.ts";

describe("dspec plan", () => {
  // §13.4 — refuse, do not auto-select.
  test("refuses a behaviour view paired with an adapter whose sequence capability is no", () => {
    const spec = validSpec();
    spec.renderers = { behaviour: { adapter: "no-cycles" }, deployment: { adapter: "svg" } };
    const result = plan(spec, { ...registry, "no-cycles": fakeAdapter({ sequence: "no" }) });
    expect(result.ok).toBe(false);
    const refused = result.entries.find((entry) => entry.view.id === "behaviour");
    expect(refused?.refused?.code).toBe("adapter-capability-missing");
    expect(describePlan(result).join("\n")).toContain("capabilities.sequence = no");
  });

  test("refuses a state view paired with an adapter whose state capability is no", () => {
    const spec = validSpec();
    spec.views[1] = { id: "deployment", kind: "state", caption: "peer states" };
    spec.renderers = { behaviour: { adapter: "svg" }, deployment: { adapter: "no-states" } };
    const result = plan(spec, { ...registry, "no-states": fakeAdapter({ state: "no" }) });
    expect(result.ok).toBe(false);
  });

  test("refuses an invalid primary even when the YAML names another adapter", () => {
    const spec = validSpec();
    // The schema owns the accepted shape; this malformed legacy input must not
    // become an implicit selection mechanism.
    spec.renderers = { behaviour: { adapter: "no-cycles", fallback: "svg" }, deployment: { adapter: "svg" } } as never;
    const result = plan(spec, { ...registry, "no-cycles": fakeAdapter({ sequence: "no" }) });
    expect(result.ok).toBe(false);
    const entry = result.entries.find((candidate) => candidate.view.id === "behaviour");
    expect(entry?.adapter).toBeUndefined();
    expect(entry?.refused?.reason).toContain("capabilities.sequence = no");
  });

  test("refuses a view with no configured renderer", () => {
    const spec = validSpec();
    spec.renderers = { behaviour: { adapter: "svg" } } as never;
    const result = plan(spec, registry);
    expect(result.ok).toBe(false);
    expect(result.entries.find((entry) => entry.view.id === "deployment")?.refused?.code).toBe("no-renderer-configured");
  });

  test("refuses an unknown adapter id", () => {
    const spec = validSpec();
    spec.renderers = { behaviour: { adapter: "graphviz" }, deployment: { adapter: "svg" } };
    const result = plan(spec, registry);
    expect(result.ok).toBe(false);
    expect(result.entries.some((entry) => entry.refused?.reason.includes("graphviz"))).toBe(true);
  });

  test("resolves the shipped adapters' declared capabilities", () => {
    const spec = validSpec();
    const result = plan(spec, registry);
    expect(result.ok).toBe(true);
    expect(result.entries.map((entry) => `${entry.view.id}:${entry.adapter?.id}:${entry.capability}`)).toEqual([
      "behaviour:d2:native",
      "deployment:d2:native",
    ]);
  });
});
