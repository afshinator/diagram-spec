import type { Band, DiagramContent, Loop, Message, View } from "../schema.ts";
import type { RendererAdapter } from "../plan.ts";
import { GENERATED_HEADER, bandLabel, bandsFor, id, legendText, loopLabel, loopsOf, messagesOf, symmetricClass, terminalText, visitWithLoops } from "./shared.ts";

const escape = (text: string) => text.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
const quote = (text: string) => `"${escape(text)}"`;
const textNode = (key: string, body: string) => `${key}: ${quote(body)} { shape: text }`;

/** d2 rejects markdown table rows inside block strings, so the legend is text nodes. */
function legendBlock(spec: DiagramContent): string[] {
  if (spec.legend.length === 0) return [];
  return [
    "legend: Legend {",
    "  shape: rectangle",
    '  style.fill: "#f6f8fa"',
    ...spec.legend.map((entry, index) => `  l${index}: ${quote(`${entry.class} = ${entry.meaning}`)} { shape: text }`),
    "}",
  ];
}

function notesBlock(spec: DiagramContent, view: View): string[] {
  return [
    ...terminalText(spec).map((line, index) => textNode(`t${index}`, line)),
    ...bandsFor(spec, view).map((band) => textNode(`b_${id(band.id)}`, bandLabel(band))),
    ...spec.meta.source_of_truth.map((source, index) => textNode(`src${index}`, `source: ${source}`)),
    textNode("reading", `reading: ${spec.meta.reading_direction}`),
    textNode("view_note", `${view.caption} [${view.kind}]`),
  ].map((line) => `  ${line}`);
}

/** Messages, with any contiguous run covered by a loop wrapped in a d2 group. */
function groupedMessages(spec: DiagramContent, messages: Message[], loops: Loop[]): string[] {
  const lines: string[] = [];
  visitWithLoops(messages, loops, {
    open: (loop) => lines.push(`group: ${quote(loopLabel(loop))} {`),
    close: () => lines.push("}"),
    message: (message) =>
      lines.push(
        `${message.from} ${symmetricClass(spec, message.label) ? "<->" : "->"} ${message.to}: ${quote(message.label)}`,
      ),
  });
  return lines;
}

function bandContainer(band: Band, spec: DiagramContent): string[] {
  const members = band.membership.flatMap((memberId) =>
    spec.actors.filter((actor) => actor.id === memberId).map((actor) => `  ${actor.id}: ${quote(actor.label)}`),
  );
  return [
    `band_${id(band.id)}: ${quote(band.label)} {`,
    ...members,
    `  definition: ${quote(band.definition ?? "no definition")} { shape: text }`,
    "}",
  ];
}

function sequenceView(spec: DiagramContent, view: View): string {
  const messages = messagesOf(spec, view);
  const loops = loopsOf(spec, view);
  const span = spec.actors.length >= 2 ? [spec.actors[0]!.id, spec.actors.at(-1)!.id] : [];
  const legend = legendText(spec);
  return (
    [
      GENERATED_HEADER,
      // `title:` is not a sequence-diagram field: d2 renders it as a participant.
      `# title: ${spec.meta.title} — ${view.caption}`,
      `# reading: ${spec.meta.reading_direction}`,
      "shape: sequence_diagram",
      ...spec.actors.map((actor) => `${actor.id}: ${quote(actor.label)}`),
      ...(span.length === 2 ? [`note over ${span.join(", ")}: ${quote(`${spec.meta.title} — ${view.caption}`)}`] : []),
      ...groupedMessages(spec, messages, loops),
      ...loops.map((loop) => `note over ${loop.over.join(", ")}: ${quote(`loop ${loop.id} — exit: ${loop.exit ?? ""}`)}`),
      ...(legend && span.length === 2 ? [`note over ${span.join(", ")}: ${quote(`legend: ${legend}`)}`] : []),
    ].join("\n") + "\n"
  );
}

function graphView(spec: DiagramContent, view: View): string {
  const messages = messagesOf(spec, view);
  const loops = loopsOf(spec, view);
  const bands = bandsFor(spec, view);
  const banded = new Set(bands.flatMap((band) => band.membership));
  const chain = bands.map((band) => `band_${id(band.id)}`);

  const lines = [
    GENERATED_HEADER,
    `# title: ${spec.meta.title} — ${view.caption}`,
    `# reading: ${spec.meta.reading_direction}`,
    // d2 only honours a reading direction when something links the blocks, so the
    // blocks below are chained with invisible edges instead of floating in a row.
    `direction: ${spec.meta.reading_direction === "left-right" ? "right" : "down"}`,
    ...bands.flatMap((band) => bandContainer(band, spec)),
    ...spec.actors.filter((actor) => !banded.has(actor.id)).map((actor) => `${actor.id}: ${quote(actor.label)}`),
    ...messages.map(
      (message) =>
        `${message.from} ${symmetricClass(spec, message.label) ? "<->" : "->"} ${message.to}: ${quote(message.label)}`,
    ),
    // The loop is a labelled node, not invented edges: nothing here draws an arrow
    // the YAML does not declare.
    ...loops.map((loop) => textNode(`loop_${id(loop.id)}`, loopLabel(loop))),
  ];

  if (spec.legend.length) {
    lines.push(...legendBlock(spec));
    chain.push("legend");
  }
  lines.push("notes: Notes {", ...notesBlock(spec, view), "}");
  chain.push("notes");

  for (let index = 1; index < chain.length; index += 1) {
    lines.push(`${chain[index - 1]} -> ${chain[index]}: ${quote("")} { style.opacity: 0; style.stroke-width: 0 }`);
  }
  return lines.join("\n") + "\n";
}

export const d2Adapter: RendererAdapter = {
  id: "d2",
  // Measured against d2 v0.9.0: sequence diagrams, state and containers are all
  // first-class, so no capability here is a stand-in.
  capabilities: { sequence: "native", state: "native", component: "native", deterministic: true, requiresRuntime: "d2" },
  emit(spec, view) {
    const contents = view.kind === "sequence" ? sequenceView(spec, view) : graphView(spec, view);
    return [{ path: `${view.id}.d2`, contents }];
  },
  async render(files, outDir) {
    if (!Bun.which("d2")) throw new Error("d2 is not installed: install it or pair the view with the svg adapter");
    const artifacts: { path: string; bytes: number }[] = [];
    for (const file of files) {
      const target = `${outDir}/${file.path.replace(/\.d2$/, ".svg")}`;
      await Bun.write(`${outDir}/${file.path}`, file.contents);
      const result = Bun.spawnSync(["d2", `${outDir}/${file.path}`, target], { stderr: "pipe", stdout: "pipe" });
      if (result.exitCode !== 0) {
        throw new Error(`d2 failed on ${file.path}: ${result.stderr.toString().trim()}`);
      }
      artifacts.push({ path: target, bytes: (await Bun.file(target).arrayBuffer()).byteLength });
    }
    return artifacts;
  },
};
