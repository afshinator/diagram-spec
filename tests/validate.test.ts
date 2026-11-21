import { describe, expect, test } from "bun:test";
import { validate } from "../src/validate.ts";
import { registry as shipped } from "../src/renderers/index.ts";
import { fakeAdapter, validSpec } from "./helpers.ts";

function codes(spec: unknown, opts?: Parameters<typeof validate>[1]): string[] {
  return validate(spec, opts).errors.map((e) => e.code);
}

describe("dspec validate", () => {
  test("accepts a valid two-view spec", () => {
    const result = validate(validSpec());
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  // §6.1 no view with kind sequence|state
  test("rejects a spec with no behaviour view", () => {
    const spec = validSpec();
    spec.views = [{ id: "deployment", kind: "component", caption: "what runs where" }];
    spec.messages = [];
    spec.loops = [];
    spec.bands = [{ id: "peers", label: "peers", membership: ["dev_a"], definition: "x", view: "deployment" }];
    expect(codes(spec)).toContain("behaviour-view-missing");
  });

  // §6.2 a behaviour view whose kind cannot express iteration
  test("rejects flow carried by a view kind that cannot iterate", () => {
    const spec = validSpec();
    spec.views.push({ id: "swap", kind: "component", caption: "peer swap" });
    spec.messages.push({ from: "dev_a", to: "dev_b", label: "dispatch", view: "swap" });
    const result = validate(spec);
    expect(result.errors.map((e) => e.code)).toContain("behaviour-kind-cannot-iterate");
    expect(result.errors.some((e) => e.path === "views[2]")).toBe(true);
  });

  // §6.3 fewer than 2 actors, and any actor without a role
  test("rejects fewer than two actors", () => {
    const spec = validSpec();
    spec.actors = [spec.actors[0]!];
    spec.messages = [];
    expect(codes(spec)).toContain("actors-too-few");
  });

  test("rejects an actor without a role", () => {
    const spec = validSpec();
    spec.actors[1] = { id: "dev_a", label: "dev_a", kind: "human" } as never;
    const result = validate(spec);
    expect(result.errors.map((e) => e.code)).toContain("actor-role-missing");
    expect(result.errors.some((e) => e.path === "actors[1].role")).toBe(true);
  });

  // §6.4 no loop, or a loop lacking an exit
  test("rejects a spec with no loop", () => {
    const spec = validSpec();
    spec.loops = [];
    expect(codes(spec)).toContain("loop-missing");
  });

  test("rejects a loop without an exit condition", () => {
    const spec = validSpec();
    spec.loops[0] = { id: "peer-loop", over: ["supervisor", "dev_a"], view: "behaviour" } as never;
    const result = validate(spec);
    expect(result.errors.map((e) => e.code)).toContain("loop-exit-missing");
    expect(result.errors.some((e) => e.path === "loops[0].exit")).toBe(true);
  });

  // §6.5 reading direction unset
  test("rejects an unset reading direction", () => {
    const spec = validSpec();
    delete (spec.meta as { reading_direction?: string }).reading_direction;
    const result = validate(spec);
    expect(result.errors.map((e) => e.code)).toContain("reading-direction-missing");
    expect(result.errors.some((e) => e.path === "meta.reading_direction")).toBe(true);
  });

  // §6.6 legend missing, or fewer than 2 classes, on a multi-flow view
  test("rejects a multi-flow view with no legend", () => {
    const spec = validSpec();
    spec.legend = [];
    expect(codes(spec)).toContain("legend-missing");
  });

  test("rejects a legend with fewer than two classes on a multi-flow view", () => {
    const spec = validSpec();
    spec.legend = [{ class: "control", meaning: "dispatch of work" }];
    expect(codes(spec)).toContain("legend-fewer-than-two-classes");
  });

  // §6.7 band with empty membership, or a transport+actor label
  test("rejects a band with empty membership", () => {
    const spec = validSpec();
    spec.bands[1] = { id: "peers", label: "peers", membership: [], definition: "the implementers", view: "deployment" };
    expect(codes(spec)).toContain("band-membership-empty");
  });

  test("rejects a band label that merges transport with actors", () => {
    const spec = validSpec();
    spec.bands[1] = {
      id: "bus-peers",
      label: "Bus · peers",
      membership: ["dev_a", "dev_b"],
      definition: "the relay and the implementers",
      view: "deployment",
    };
    expect(codes(spec)).toContain("band-label-merges-concepts");
  });

  // §6.8 a message label that is not in the declared vocabulary
  test("rejects a message label outside the vocabulary", () => {
    const spec = validSpec();
    spec.messages[0] = { from: "supervisor", to: "dev_a", label: "control", view: "behaviour" };
    const result = validate(spec);
    expect(result.errors.map((e) => e.code)).toContain("message-label-not-in-vocabulary");
    expect(result.errors.some((e) => e.path === "messages[0].label")).toBe(true);
  });

  // §6.9 empty source_of_truth
  test("rejects an empty source_of_truth", () => {
    const spec = validSpec();
    spec.meta.source_of_truth = [];
    const result = validate(spec);
    expect(result.errors.map((e) => e.code)).toContain("source-of-truth-missing");
    expect(result.errors.some((e) => e.path === "meta.source_of_truth")).toBe(true);
  });

  // §6.10 a configured adapter that cannot express the view it is paired with
  test("rejects an adapter that cannot express the view it is paired with", () => {
    const spec = validSpec();
    spec.renderers = { behaviour: { adapter: "no-cycles" }, deployment: { adapter: "d2" } } as never;
    const result = validate(spec, { adapters: { "no-cycles": fakeAdapter({ sequence: "no" }) } });
    expect(result.errors.map((e) => e.code)).toContain("adapter-capability-missing");
    expect(result.errors.some((e) => e.path === "renderers.behaviour")).toBe(true);
  });

  test("rejects an adapter id that declares no capabilities at all", () => {
    const spec = validSpec();
    spec.renderers = { behaviour: { adapter: "imagemagick" }, deployment: { adapter: "d2" } } as never;
    const result = validate(spec);
    expect(result.errors.map((e) => e.code)).toContain("adapter-capability-missing");
    expect(result.errors.some((e) => e.reason.includes("imagemagick"))).toBe(true);
  });

  test("rejects a non-deterministic adapter for CI use", () => {
    const spec = validSpec();
    spec.renderers = { behaviour: { adapter: "wobbly" }, deployment: { adapter: "d2" } } as never;
    const opts = { adapters: { wobbly: fakeAdapter({ deterministic: false }) } };
    expect(codes(spec, opts)).toContain("adapter-not-deterministic");
  });

  // integrity: references must resolve, otherwise emit cannot be correct
  test("rejects a message from an undeclared actor", () => {
    const spec = validSpec();
    spec.messages.push({ from: "reviewer", to: "supervisor", label: "verdict", view: "behaviour" });
    const result = validate(spec);
    expect(result.errors.map((e) => e.code)).toContain("dangling-reference");
    expect(result.errors.some((e) => e.path === "messages[3].from")).toBe(true);
  });

  test("rejects duplicate ids that would emit to the same file", () => {
    const spec = validSpec();
    spec.views.push({ id: "behaviour", kind: "sequence", caption: "a second view with the same id" });
    const result = validate(spec);
    expect(result.errors.map((e) => e.code)).toContain("duplicate-id");
    expect(result.errors.some((e) => e.path === "views[2].id")).toBe(true);
  });

  test("accepts a pairing whose fallback can express the view", () => {
    const spec = validSpec();
    spec.renderers = { behaviour: { adapter: "no-cycles", fallback: "svg" }, deployment: { adapter: "svg" } } as never;
    const result = validate(spec, { adapters: { ...shipped, "no-cycles": fakeAdapter({ sequence: "no" }) } });
    expect(result.ok).toBe(true);
  });

  test("rejects a pairing whose adapter and fallback both cannot express the view", () => {
    const spec = validSpec();
    spec.renderers = {
      behaviour: { adapter: "no-cycles", fallback: "also-no" },
      deployment: { adapter: "svg" },
    } as never;
    const adapters = {
      ...shipped,
      "no-cycles": fakeAdapter({ sequence: "no" }),
      "also-no": fakeAdapter({ sequence: "no" }),
    };
    const result = validate(spec, { adapters });
    expect(result.errors.some((e) => e.reason.includes("fallback refused too"))).toBe(true);
  });

  test("reports a schema error in the same path + reason shape", () => {
    const spec = validSpec() as unknown as Record<string, unknown>;
    (spec.meta as Record<string, unknown>).reading_direction = "sideways";
    const result = validate(spec);
    expect(result.errors[0]?.code).toBe("schema");
    expect(result.errors[0]?.path).toBe("meta.reading_direction");
  });

  test("reports path + reason, human readable", () => {
    const spec = validSpec();
    delete (spec.meta as { reading_direction?: string }).reading_direction;
    const [error] = validate(spec).errors;
    expect(error ? `${error.path}: ${error.reason}` : "").toMatch(/^meta\.reading_direction: /);
  });
});
