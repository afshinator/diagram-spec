import type { DiagramContent, View } from "../schema.ts";
import type { RendererAdapter } from "../plan.ts";
import { GENERATED_NOTE, bandLabel, bandsFor, classOf, id, legendText, loopsOf, messagesOf, sourcesText, symmetricClass, terminalText, visitWithLoops } from "./shared.ts";

/** Mermaid comments are `%%`; the note itself is shared with the other adapters. */
const HEADER = `%% ${GENERATED_NOTE}`;

/** Mermaid statement separators are `;` and newlines, and quoted text cannot hold `"`. */
const safe = (text: string) => text.replace(/[;\n]/g, ",").replace(/"/g, "'");

const arrow = (kind: string, symmetric: boolean) => {
  const dotted = kind === "report" || kind === "query";
  if (symmetric) return dotted ? "<<-->>" : "<<->>";
  return dotted ? "-->>" : "->>";
};
const edge = (kind: string, symmetric: boolean) =>
  symmetric ? "<-->" : kind === "report" || kind === "query" ? "-.->" : kind === "verdict" ? "==>" : "-->";

const labelled = (spec: DiagramContent, label: string) => safe(`${label} (${classOf(spec, label)})`);

/** mermaid requires its frontmatter on line 1, so the header comment follows it. */
function front(spec: DiagramContent, view: View): string[] {
  return [
    "---",
    `title: ${safe(spec.meta.title)} — ${safe(view.caption)}`,
    "---",
    HEADER,
    `%% reading: ${spec.meta.reading_direction}`,
  ];
}

function sequenceView(spec: DiagramContent, view: View): string {
  const messages = messagesOf(spec, view);
  const loops = loopsOf(spec, view);
  const ids = spec.actors.map((actor) => id(actor.id));
  const span = ids.length >= 2 ? `${ids[0]},${ids.at(-1)}` : (ids[0] ?? "");
  const lines = [...front(spec, view), "sequenceDiagram", "    autonumber"];

  for (const actor of spec.actors) lines.push(`    participant ${id(actor.id)} as ${safe(actor.label)}`);

  visitWithLoops(messages, loops, {
    open: (loop) => lines.push(`    loop ${safe(`${loop.id} until ${loop.exit ?? ""}`)}`),
    close: () => lines.push("    end"),
    message: (message) =>
      lines.push(
        `    ${id(message.from)}${arrow(classOf(spec, message.label), symmetricClass(spec, message.label))}${id(message.to)}: ${labelled(spec, message.label)}`,
      ),
  });

  const legend = legendText(spec);
  // mermaid allows `Note over A,B` for exactly two participants, never three.
  if (legend) lines.push(`    Note over ${span}: ${safe(`legend: ${legend}`)}`);
  for (const entry of spec.terminal) {
    lines.push(`    Note over ${id(entry.actor)}: ${safe(`terminal: ${entry.action} -> ${entry.produces.join(", ")}`)}`);
  }
  return lines.join("\n") + "\n";
}

function stateView(spec: DiagramContent, view: View): string {
  const messages = messagesOf(spec, view);
  const loops = loopsOf(spec, view);
  const lines = [
    ...front(spec, view),
    "stateDiagram-v2",
    `    direction ${spec.meta.reading_direction === "left-right" ? "LR" : "TB"}`,
    ...spec.actors.map((actor) => `    ${id(actor.id)}: ${safe(actor.label)}`),
    ...messages.map(
      (message) => `    ${id(message.from)} --> ${id(message.to)}: ${labelled(spec, message.label)}`,
    ),
  ];
  for (const loop of loops) {
    lines.push(`    note right of ${id(loop.over[0] ?? spec.actors[0]?.id ?? "loop")}`);
    lines.push(`        ${safe(`loop ${loop.id} over ${loop.over.join(", ")} — exit: ${loop.exit ?? ""}`)}`);
    lines.push("    end note");
  }
  const legend = legendText(spec);
  if (legend && spec.actors[0]) {
    lines.push(`    note left of ${id(spec.actors[0].id)}`, `        ${safe(`legend: ${legend}`)}`, "    end note");
  }
  return lines.join("\n") + "\n";
}

function componentView(spec: DiagramContent, view: View): string {
  const messages = messagesOf(spec, view);
  const bands = bandsFor(spec, view);
  const banded = new Set(bands.flatMap((band) => band.membership));
  const direction = spec.meta.reading_direction === "left-right" ? "LR" : "TB";
  const lines = [...front(spec, view), `flowchart ${direction}`];

  for (const band of bands) {
    lines.push(`    subgraph band_${id(band.id)}["${safe(band.label)}"]`);
    const members = band.membership.flatMap((memberId) =>
      spec.actors.filter((actor) => actor.id === memberId).map((actor) => `        ${id(actor.id)}["${safe(actor.label)}"]`),
    );
    lines.push(...members, "    end");
  }
  for (const actor of spec.actors.filter((candidate) => !banded.has(candidate.id))) {
    lines.push(`    ${id(actor.id)}["${safe(actor.label)}"]`);
  }
  for (const message of messages) {
    lines.push(
      `    ${id(message.from)} ${edge(classOf(spec, message.label), symmetricClass(spec, message.label))}|"${labelled(spec, message.label)}"| ${id(message.to)}`,
    );
  }
  for (const loop of loopsOf(spec, view)) {
    lines.push(
      `    loop_${id(loop.id)}[(["${safe(`loop ${loop.id} over ${loop.over.join(", ")} — exit: ${loop.exit ?? ""}`)}"])]`,
    );
  }
  if (spec.legend.length) {
    lines.push('    subgraph legend["Legend"]');
    spec.legend.forEach((entry, index) =>
      lines.push(`        legend_${index}["${safe(`${entry.class} = ${entry.meaning}`)}"]`),
    );
    lines.push("    end");
  }
  lines.push(`    subgraph notes["Notes"]`);
  const notes = [...bands.map(bandLabel), ...terminalText(spec), sourcesText(spec)];
  notes.forEach((line, index) => lines.push(`        note_${index}["${safe(line)}"]`));
  lines.push("    end");
  return lines.join("\n") + "\n";
}

export const mermaidAdapter: RendererAdapter = {
  id: "mermaid",
  // Measured with mermaid-cli 11 against the locally installed Chrome: sequence
  // loops, state transitions and flowcharts all render from this source.
  capabilities: {
    sequence: "native",
    state: "native",
    component: "native",
    deterministic: true,
    requiresRuntime: "node + chromium (mmdc)",
  },
  emit(spec, view) {
    const contents =
      view.kind === "sequence"
        ? sequenceView(spec, view)
        : view.kind === "state"
          ? stateView(spec, view)
          : componentView(spec, view);
    return [{ path: `${view.id}.mmd`, contents }];
  },
};
