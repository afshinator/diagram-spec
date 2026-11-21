#!/usr/bin/env bun
import { existsSync, mkdirSync } from "node:fs";
import { parseArgs } from "node:util";
import skeleton from "../assets/diagram-content.yaml" with { type: "text" };
import { emit, render } from "./emit.ts";
import { describePlan, plan } from "./plan.ts";
import { adapters } from "./renderers/index.ts";
import { formatErrors, validate } from "./validate.ts";

const USAGE = `dspec — validated, renderer-agnostic diagram content

  dspec init [dir]                write a diagram-content.yaml skeleton
  dspec validate <file>           gate the content (no render on failure)
  dspec plan <file>               resolve view -> adapter, refusing bad pairings
  dspec emit <file> [--out dir]   write renderer-native sources
  dspec render <file> [--out dir] emit, then render where the adapter can
  dspec adapters                  list adapters and their declared capabilities

No network, no model, no telemetry: the core is deterministic by construction.`;

function die(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

async function loadSpec(file: string): Promise<unknown> {
  if (!existsSync(file)) die(`${file}: no such file`);
  const text = await Bun.file(file).text();
  try {
    return Bun.YAML.parse(text);
  } catch (error) {
    die(`${file}: ${(error as Error).message}`);
  }
}

function capabilitiesTable(): string {
  const rows = adapters.map((adapter) => {
    const caps = adapter.capabilities;
    const runtime = caps.requiresRuntime ? ` runtime=${caps.requiresRuntime}` : " runtime=none";
    return `${adapter.id.padEnd(8)} sequence=${caps.sequence.padEnd(12)} state=${caps.state.padEnd(12)} component=${caps.component.padEnd(12)} deterministic=${caps.deterministic}${runtime}`;
  });
  return ["adapter  capabilities", ...rows].join("\n");
}

/** Validate first; every other command refuses to act on content that fails the gate. */
function gated(raw: unknown, file: string) {
  const result = validate(raw);
  if (!result.ok || !result.spec) {
    process.stderr.write(`${formatErrors(result.errors)}\n`);
    die(`${file}: content does not validate; fix the content, do not render it`);
  }
  return result.spec;
}

async function writeFiles(files: { path: string; contents: string }[], outDir: string) {
  mkdirSync(outDir, { recursive: true });
  for (const produced of files) {
    await Bun.write(`${outDir}/${produced.path}`, produced.contents);
    process.stdout.write(`${outDir}/${produced.path}\n`);
  }
}

const commands: Record<string, (args: { file?: string; out: string; raw: () => Promise<unknown> }) => Promise<void>> = {
  async init({ file }) {
    const dir = file ?? ".";
    mkdirSync(dir, { recursive: true });
    const target = `${dir}/diagram-content.yaml`;
    if (existsSync(target)) die(`${target} exists: the YAML is the source of truth, not something to overwrite`);
    await Bun.write(target, skeleton);
    process.stdout.write(`${target}\n`);
  },

  async adapters() {
    process.stdout.write(`${capabilitiesTable()}\n`);
  },

  async validate({ file, raw }) {
    if (!file) die("validate: needs a diagram-content.yaml path");
    const started = performance.now();
    const result = validate(await raw());
    const elapsed = performance.now() - started;
    if (!result.ok) {
      process.stderr.write(`${formatErrors(result.errors)}\n`);
      process.exit(1);
    }
    process.stdout.write(`valid\n`);
    process.stderr.write(`(validator ${elapsed.toFixed(1)} ms)\n`);
  },

  async plan({ file, raw }) {
    if (!file) die("plan: needs a diagram-content.yaml path");
    const spec = gated(await raw(), file);
    const resolved = plan(spec, Object.fromEntries(adapters.map((adapter) => [adapter.id, adapter])));
    process.stdout.write(`${describePlan(resolved).join("\n")}\n`);
    if (!resolved.ok) process.exit(1);
  },

  async emit({ file, out, raw }) {
    if (!file) die("emit: needs a diagram-content.yaml path");
    const result = emit(await raw());
    if (result.errors.length) die(result.errors.join("\n"));
    await writeFiles(result.files, out);
  },

  async render({ file, out, raw }) {
    if (!file) die("render: needs a diagram-content.yaml path");
    const result = await render(await raw(), out);
    if (result.errors.length) die(result.errors.join("\n"));
    for (const artifact of result.artifacts) process.stdout.write(`${artifact.path} (${artifact.bytes} bytes)\n`);
  },
};

function parseCli() {
  const { values, positionals } = parseArgs({
    args: Bun.argv.slice(2),
    allowPositionals: true,
    options: { out: { type: "string", short: "o" }, help: { type: "boolean", short: "h" } },
  });
  const [command, file] = positionals;
  return { help: values.help ?? false, command, file, out: values.out ?? "out" };
}

async function main() {
  const { help, command, file, out } = parseCli();
  if (help || !command) {
    process.stdout.write(`${USAGE}\n`);
    return;
  }
  const run = commands[command];
  if (!run) die(`${command}: unknown command\n\n${USAGE}`);
  await run({ file, out, raw: () => loadSpec(file ?? "") });
}

await main();
