import { existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { emit } from "../src/emit.ts";

/**
 * Generated renderer DSLs are committed so a reviewer can read what the YAML
 * produces without running the tool, and so drift is a failing check.
 *
 * The YAML owns the pairing (`renderers:`); this script never overrides it.
 * `--write` regenerates; the default mode verifies and exits non-zero on drift.
 */

const FIXTURES = ["peer-system", "state-machine"];
const ROOT = new URL("..", import.meta.url).pathname;

type Produced = Map<string, string>;

async function productFor(fixture: string): Promise<Produced> {
  const specPath = `${ROOT}examples/${fixture}.yaml`;
  if (!existsSync(specPath)) throw new Error(`${specPath}: fixture is missing`);
  const raw = Bun.YAML.parse(await Bun.file(specPath).text());
  const result = emit(raw);
  if (result.errors.length) throw new Error(`${fixture}: ${result.errors.join("\n")}`);
  return new Map(result.files.map((file) => [file.path, file.contents]));
}

async function committedFor(fixture: string): Promise<Produced> {
  const dir = `${ROOT}generated/${fixture}`;
  if (!existsSync(dir)) return new Map();
  const entries = await Promise.all(
    readdirSync(dir).map(async (name) => [name, await Bun.file(`${dir}/${name}`).text()] as const),
  );
  return new Map(entries);
}

function driftLine(fixture: string, path: string, produced: Produced, committed: Produced): string | null {
  const shown = `generated/${fixture}/${path}`;
  if (!produced.has(path)) return `stale    ${shown}`;
  if (!committed.has(path)) return `missing  ${shown}`;
  return committed.get(path) === produced.get(path) ? null : `changed  ${shown}`;
}

function compare(fixture: string, produced: Produced, committed: Produced): string[] {
  return [...new Set([...produced.keys(), ...committed.keys()])]
    .map((path) => driftLine(fixture, path, produced, committed))
    .filter((line): line is string => line !== null);
}

const write = Bun.argv.includes("--write");
const drift: string[] = [];

for (const fixture of FIXTURES) {
  const produced = await productFor(fixture);
  if (write) {
    const dir = `${ROOT}generated/${fixture}`;
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    for (const [path, contents] of produced) await Bun.write(`${dir}/${path}`, contents);
    process.stdout.write(`wrote generated/${fixture} (${produced.size} files)\n`);
    continue;
  }
  drift.push(...compare(fixture, produced, await committedFor(fixture)));
}

if (write) process.exit(0);

if (drift.length) {
  process.stderr.write(`${drift.join("\n")}\n`);
  process.stderr.write("\ngenerated files are stale: run `bun run generated` and commit the result\n");
  process.exit(1);
}
process.stdout.write("generated files match their YAML\n");
