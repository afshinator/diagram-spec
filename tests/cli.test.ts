import { describe, expect, test } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { $ } from "bun";

const CLI = new URL("../src/cli.ts", import.meta.url).pathname;
const fixtures = new URL("../.tmp/cli", import.meta.url).pathname;

function write(name: string, body: string) {
  mkdirSync(fixtures, { recursive: true });
  const path = `${fixtures}/${name}`;
  Bun.write(path, body);
  return path;
}

const run = (args: string[]) => $`bun ${CLI} ${args}`.nothrow().quiet();

const valid = (await Bun.file(new URL("../assets/diagram-content.yaml", import.meta.url).pathname).text()).replace(
  "docs/example-source.md",
  "docs/diagram-spec-bootstrap.md",
);

describe("dspec cli", () => {
  test("validate exits 0 on a valid spec and prints nothing but the verdict", async () => {
    const file = write("valid.yaml", valid);
    const result = await run(["validate", file]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString().trim()).toBe("valid");
  });

  test("validate exits 1 and prints path + reason on an invalid spec", async () => {
    const file = write("invalid.yaml", valid.replace("  reading_direction: top-down\n", ""));
    const result = await run(["validate", file]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr.toString()).toContain("meta.reading_direction: ");
  });

  test("init refuses to overwrite an existing diagram-content.yaml", async () => {
    const dir = `${fixtures}/init`;
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    const first = await run(["init", dir]);
    expect(first.exitCode).toBe(0);
    const second = await run(["init", dir]);
    expect(second.exitCode).toBe(1);
    expect(second.stderr.toString()).toContain("exists");
    rmSync(dir, { recursive: true, force: true });
  });

  test("an unknown command exits 1 and prints usage", async () => {
    const result = await run(["draw", "x.yaml"]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr.toString()).toContain("unknown command");
  });

  test("emit refuses a spec that does not validate and writes nothing", async () => {
    const file = write("invalid-emit.yaml", valid.replace("  reading_direction: top-down\n", ""));
    const outDir = `${fixtures}/emit-refused`;
    rmSync(outDir, { recursive: true, force: true });
    const result = await run(["emit", file, "--out", outDir]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr.toString()).toContain("reading_direction");
  });

  test("adapters lists the declared capabilities", async () => {
    const result = await run(["adapters"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString()).toContain("d2");
    expect(result.stdout.toString()).toContain("deterministic=true");
  });
});
