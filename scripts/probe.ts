/**
 * Reproduces the d2 measurements recorded in docs/adapter-findings.md.
 *
 * Prose cannot be re-run, so a claim written from memory can be wrong and stay wrong.
 * When the loop evidence was first recorded it used `span:`, which is not a sequence
 * keyword and produces the very phantom column it was meant to rule out. This script
 * exists so that class of error fails instead of shipping.
 *
 * Run: bun run probe      (skips cleanly, exit 0, if d2 is absent)
 */
import { mkdirSync, rmSync } from "node:fs";

const ROOT = new URL("../.tmp/probe", import.meta.url).pathname;

type Case = { name: string; source: string };

const cases: Case[] = [
  {
    name: "baseline-two-actors",
    source: `shape: sequence_diagram\nsup: Supervisor\na: dev_a\nsup -> a: dispatch\n`,
  },
  {
    // An extra label on the actor row means d2 invented a participant column.
    name: "note-over-adds-column",
    source: `shape: sequence_diagram\nsup: Supervisor\na: dev_a\nsup -> a: dispatch\nnote over sup, a: "a note"\n`,
  },
  {
    name: "text-shape-adds-column",
    source: `shape: sequence_diagram\nsup: Supervisor\na: dev_a\nview_note: "legend: control = dispatch" { shape: text }\nsup -> a: dispatch\n`,
  },
  {
    name: "legend-container-adds-column",
    source: `shape: sequence_diagram\nsup: Supervisor\na: dev_a\nlegend: Legend {\n  control: "work"\n}\nsup -> a: dispatch\n`,
  },
  {
    name: "group-label-is-column-free",
    source: `shape: sequence_diagram\nsup: Supervisor\na: dev_a\ngroup: "work-loop until report received" {\n  sup -> a: dispatch\n}\n`,
  },
];

/** Labels d2 draws on the participant header row. Anything beyond the declared two is a
 * participant d2 invented. */
async function actorRow(svgPath: string): Promise<string[]> {
  const svg = await Bun.file(svgPath).text();
  const rows = [...svg.matchAll(/<text[^>]*\by="([\d.]+)"[^>]*>([^<]*)<\/text>/g)];
  if (rows.length === 0) return [];
  const headerY = rows[0]![1];
  return rows.filter((row) => row[1] === headerY).map((row) => row[2]!);
}

/** Vertical lifeline paths. Counts reserved columns, whether or not one got a label. */
async function lifelines(svgPath: string): Promise<number> {
  const svg = await Bun.file(svgPath).text();
  return [...svg.matchAll(/d="M ([\d.]+) [\d.]+ L ([\d.]+) [\d.]+"/g)].filter(
    (match) => match[1] === match[2],
  ).length;
}

async function render(name: string, source: string): Promise<string> {
  const file = `${ROOT}/${name}.d2`;
  await Bun.write(file, source);
  const result = Bun.spawnSync(["d2", file, `${ROOT}/${name}.svg`], { stderr: "pipe", stdout: "pipe" });
  if (result.exitCode !== 0) throw new Error(`d2 failed for ${name}: ${result.stderr.toString().trim()}`);
  return `${ROOT}/${name}.svg`;
}

const EXPECTED: Record<string, { actors: number; lifelines: number }> = {
  "baseline-two-actors": { actors: 2, lifelines: 2 },
  "note-over-adds-column": { actors: 3, lifelines: 3 },
  // The subtle one: no extra header label, but a third column is still reserved.
  "text-shape-adds-column": { actors: 2, lifelines: 3 },
  "legend-container-adds-column": { actors: 3, lifelines: 3 },
  "group-label-is-column-free": { actors: 2, lifelines: 2 },
};

/** direction: is only honoured when containers are linked. Measured by aspect ratio. */
const DIRECTION_UNLINKED = `direction: down\nc1: Control {\n  sup: Supervisor\n}\nc2: Peers {\n  a: dev_a\n  b: dev_b\n}\n`;
const DIRECTION_LINKED = `${DIRECTION_UNLINKED}c1 -> c2: "" { style.opacity: 0; style.stroke-width: 0 }\n`;

async function viewBox(name: string, source: string): Promise<{ width: number; height: number }> {
  const svg = await Bun.file(await render(name, source)).text();
  const match = svg.match(/viewBox="0 0 (\d+) (\d+)"/);
  if (!match) throw new Error(`no viewBox in ${name}`);
  return { width: Number(match[1]), height: Number(match[2]) };
}

if (!Bun.which("d2")) {
  // Locally, skipping is honest: the machine simply lacks d2. In CI the workflow installs
  // d2 on purpose, so a skip there means the install failed and the gate would be green
  // while proving nothing. Fail loudly in that case instead.
  if (process.env.CI) {
    console.error("d2 missing in CI: the workflow installs it, so the claims went unverified");
    process.exit(1);
  }
  console.log("d2 not installed: skipping the adapter probe (claims stay unverified)");
  process.exit(0);
}

rmSync(ROOT, { recursive: true, force: true });
mkdirSync(ROOT, { recursive: true });

const failures: string[] = [];
console.log(`d2 ${(await Bun.$`d2 --version`.text()).trim()}`);

for (const testCase of cases) {
  const svgPath = await render(testCase.name, testCase.source);
  const row = await actorRow(svgPath);
  const columns = await lifelines(svgPath);
  const expected = EXPECTED[testCase.name]!;
  const ok = row.length === expected.actors && columns === expected.lifelines;
  if (!ok) {
    failures.push(
      `${testCase.name}: measured ${row.length} actor labels / ${columns} lifelines, expected ${expected.actors} / ${expected.lifelines} (row: ${row.join(", ") || "none"})`,
    );
  }
  console.log(
    `  ${ok ? "ok" : "MISMATCH".padEnd(8)} ${testCase.name.padEnd(30)} actors ${row.length}, lifelines ${columns}`,
  );
}

const unlinked = await viewBox("direction-unlinked", DIRECTION_UNLINKED);
const linked = await viewBox("direction-linked", DIRECTION_LINKED);
const linkedIsColumn = linked.height > linked.width;
const unlinkedIsRow = unlinked.width > unlinked.height;
if (!(linkedIsColumn && unlinkedIsRow)) {
  failures.push(`direction: linked ${linked.width}x${linked.height}, unlinked ${unlinked.width}x${unlinked.height}`);
}
console.log(
  `  ${linkedIsColumn && unlinkedIsRow ? "ok" : "MISMATCH"}       direction-needs-linking        unlinked ${unlinked.width}x${unlinked.height}, linked ${linked.width}x${linked.height}`,
);

rmSync(ROOT, { recursive: true, force: true });

if (failures.length > 0) {
  console.error(`\n${failures.length} measured claim(s) no longer hold:`);
  for (const failure of failures) console.error(`  - ${failure}`);
  console.error("\nUpdate docs/adapter-findings.md to match the measurement, or fix the adapter.");
  process.exit(1);
}
console.log("\nEvery claim in docs/adapter-findings.md reproduced.");
