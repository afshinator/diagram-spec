import type { DiagramContent, Message, View } from "../schema.ts";
import type { RendererAdapter } from "../plan.ts";
import { GENERATED_NOTE, bandsFor, classOf, loopsOf, messagesOf, symmetricClass } from "./shared.ts";

const COL = 240;
const PAD = 40;
const FONT = 'font-family="ui-sans-serif, system-ui, sans-serif"';
const CLASS_COLOR: Record<string, string> = {
  control: "#1f6feb",
  report: "#2da44e",
  query: "#8250df",
  verdict: "#bf3989",
  data: "#9a6700",
};

const esc = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const color = (kind: string) => CLASS_COLOR[kind] ?? "#57606a";

type Ctx = { spec: DiagramContent; view: View; messages: Message[]; width: number; height: number; parts: string[] };

const add = (ctx: Ctx, svg: string) => ctx.parts.push(svg);

function text(x: number, y: number, body: string, size = 12, anchor = "start", fill = "#1f2328") {
  return `<text x="${x}" y="${y}" ${FONT} font-size="${size}" text-anchor="${anchor}" fill="${fill}">${esc(body)}</text>`;
}

const arrowHead = (symmetric: boolean) => (symmetric ? 'marker-start="url(#arrow)" marker-end="url(#arrow)"' : 'marker-end="url(#arrow)"');

/** Contiguous message runs covered by a loop; empty when there is nothing to wrap. */
function loopRanges(spec: DiagramContent, view: View): { start: number; end: number; id: string; exit: string }[] {
  const messages = messagesOf(spec, view);
  if (messages.length === 0) return [];
  return loopsOf(spec, view).flatMap((loop) => {
    const covered = messages
      .map((message, index) => (loop.over.includes(message.from) && loop.over.includes(message.to) ? index : -1))
      .filter((index) => index >= 0);
    if (covered.length === 0) return [];
    return [{ start: Math.min(...covered), end: Math.max(...covered), id: loop.id, exit: loop.exit ?? "" }];
  });
}

function legend(ctx: Ctx, y: number) {
  add(ctx, text(PAD, y, "Legend", 13));
  ctx.spec.legend.forEach((entry, index) => {
    const rowY = y + 20 + index * 20;
    add(ctx, `<line x1="${PAD}" y1="${rowY - 4}" x2="${PAD + 28}" y2="${rowY - 4}" stroke="${color(entry.class)}" stroke-width="2" />`);
    add(ctx, text(PAD + 36, rowY, `${entry.class} = ${entry.meaning}`, 11));
  });
  return y + 28 + ctx.spec.legend.length * 20;
}

function bands(ctx: Ctx, y: number) {
  add(ctx, text(PAD, y, "Bands", 13));
  let row = y + 20;
  for (const band of bandsFor(ctx.spec, ctx.view)) {
    const members = band.membership.join(", ");
    add(ctx, text(PAD + 4, row, `${band.label}: ${band.definition ?? "no definition"} — members: ${members}`, 11));
    row += 18;
  }
  return row + 8;
}

function footer(ctx: Ctx, y: number) {
  for (const entry of ctx.spec.terminal) {
    add(ctx, text(PAD, y, `terminal: ${entry.actor} ${entry.action} -> ${entry.produces.join(", ") || "nothing"}`, 11));
    y += 18;
  }
  add(ctx, text(PAD, y, `source of truth: ${ctx.spec.meta.source_of_truth.join(", ")} — reading: ${ctx.spec.meta.reading_direction}`, 11, "start", "#57606a"));
  return y + 18;
}

function frame(ctx: Ctx, bodyHeight: number) {
  ctx.height = bodyHeight;
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${ctx.width}" height="${ctx.height}" viewBox="0 0 ${ctx.width} ${ctx.height}" role="img" aria-label="${esc(ctx.spec.meta.title)}">`,
    `<!-- ${GENERATED_NOTE} -->`,
    `<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#57606a" /></marker></defs>`,
    `<rect x="0" y="0" width="${ctx.width}" height="${ctx.height}" fill="#ffffff" />`,
    text(PAD, 34, ctx.spec.meta.title, 18),
    ctx.spec.meta.subtitle ? text(PAD, 52, ctx.spec.meta.subtitle, 12, "start", "#57606a") : "",
    text(PAD, 72, `${ctx.view.caption} [${ctx.view.kind}]`, 12, "start", "#57606a"),
    ...ctx.parts,
    "</svg>",
    "",
  ];
  return parts.filter((part) => part !== "").join("\n");
}

function sequenceView(spec: DiagramContent, view: View): string {
  const messages = messagesOf(spec, view);
  const actors = spec.actors.filter((actor) => messages.some((m) => m.from === actor.id || m.to === actor.id));
  const placed = actors.length ? actors : spec.actors;
  const ctx: Ctx = { spec, view, messages, width: PAD * 2 + Math.max(1, placed.length) * COL, height: 0, parts: [] };
  const x = (actorId: string) => PAD + 100 + Math.max(0, placed.findIndex((actor) => actor.id === actorId)) * COL;
  const top = 110;
  const step = 52;
  const bottom = top + 40 + messages.length * step;

  for (const actor of placed) {
    add(ctx, `<rect x="${x(actor.id) - 88}" y="${top - 26}" width="176" height="40" rx="6" fill="#f6f8fa" stroke="#d0d7de" />`);
    add(ctx, text(x(actor.id), top - 8, actor.label, 12, "middle"));
    add(ctx, text(x(actor.id), top + 8, actor.role ?? "", 9, "middle", "#57606a"));
    add(ctx, `<line x1="${x(actor.id)}" y1="${top + 14}" x2="${x(actor.id)}" y2="${bottom}" stroke="#d0d7de" stroke-dasharray="4 4" />`);
  }

  for (const range of loopRanges(spec, view)) {
    const boxY = top + 60 + range.start * step - 26;
    const boxH = (range.end - range.start) * step + 44;
    add(ctx, `<rect x="${PAD - 8}" y="${boxY}" width="${ctx.width - PAD * 2 + 16}" height="${boxH}" rx="8" fill="none" stroke="#8250df" stroke-dasharray="6 4" />`);
    add(ctx, text(PAD + 4, boxY + 18, `loop ${range.id} — exit: ${range.exit}`, 11, "start", "#8250df"));
    add(ctx, text(PAD + 4, boxY + 34, `over: ${spec.loops.find((loop) => loop.id === range.id)?.over.join(", ") ?? ""}`, 10, "start", "#8250df"));
  }

  messages.forEach((message, index) => {
    const rowY = top + 60 + index * step + 24;
    const from = x(message.from);
    const to = x(message.to);
    const kind = classOf(spec, message.label);
    const head = arrowHead(symmetricClass(spec, message.label));
    if (from === to) {
      add(ctx, `<path d="M ${from} ${rowY} h 40 v 18 h -40" fill="none" stroke="${color(kind)}" stroke-width="2" ${head} />`);
      add(ctx, text(from + 46, rowY + 12, `${message.label} (${kind})`, 11, "start", color(kind)));
      return;
    }
    const dir = to > from ? 1 : -1;
    add(ctx, `<line x1="${from}" y1="${rowY}" x2="${to - dir * 6}" y2="${rowY}" stroke="${color(kind)}" stroke-width="2" ${head} />`);
    add(ctx, text((from + to) / 2, rowY - 6, `${message.label} (${kind})`, 11, "middle", color(kind)));
  });

  let cursor = bottom + 60;
  cursor = legend(ctx, cursor);
  cursor = bands(ctx, cursor);
  cursor = footer(ctx, cursor);
  return frame(ctx, cursor + PAD);
}

function nodeView(spec: DiagramContent, view: View): string {
  const messages = messagesOf(spec, view);
  const placed = spec.actors;
  const horizontal = spec.meta.reading_direction === "left-right";
  const perRow = horizontal ? Math.max(1, placed.length) : 1;
  // Horizontal rows need room for an edge label between two boxes.
  const col = horizontal ? 340 : COL;
  const ctx: Ctx = { spec, view, messages, width: Math.max(440, PAD * 2 + perRow * col), height: 0, parts: [] };
  const top = 110;
  const boxW = 200;
  const boxH = 54;
  const pos = (actorId: string) => {
    const index = Math.max(0, placed.findIndex((actor) => actor.id === actorId));
    return { cx: PAD + (index % perRow) * col + boxW / 2, cy: top + Math.floor(index / perRow) * 120 };
  };

  messages.forEach((message, index) => {
    const a = pos(message.from);
    const b = pos(message.to);
    const kind = classOf(spec, message.label);
    const stroke = color(kind);
    const head = arrowHead(symmetricClass(spec, message.label));
    if (message.from === message.to) {
      add(ctx, `<path d="M ${a.cx + boxW / 2 - 24} ${a.cy + boxH / 2} q 44 40 4 8" fill="none" stroke="${stroke}" stroke-width="2" />`);
      add(ctx, text(a.cx + 30, a.cy + boxH / 2 + 26, `${message.label} (${kind})`, 10, "start", stroke));
      return;
    }
    // Edges follow the declared reading direction instead of always being vertical.
    const [x1, y1, x2, y2] = a.cy === b.cy
      ? [a.cx + (b.cx > a.cx ? boxW / 2 : -boxW / 2), a.cy, b.cx - (b.cx > a.cx ? boxW / 2 : -boxW / 2), b.cy]
      : [a.cx, a.cy + (b.cy > a.cy ? boxH / 2 : -boxH / 2), b.cx, b.cy - (b.cy > a.cy ? boxH / 2 : -boxH / 2)];
    add(ctx, `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="2" ${head} />`);
    add(ctx, text((x1 + x2) / 2, (y1 + y2) / 2 - 6, `${message.label} (${kind})`, 10, "middle", stroke));
  });

  for (const actor of placed) {
    const { cx, cy } = pos(actor.id);
    add(ctx, `<rect x="${cx - boxW / 2}" y="${cy - boxH / 2}" width="${boxW}" height="${boxH}" rx="6" fill="#f6f8fa" stroke="#d0d7de" />`);
    add(ctx, text(cx, cy - 4, actor.label, 12, "middle"));
    add(ctx, text(cx, cy + 12, `${actor.kind} — ${actor.role ?? ""}`, 9, "middle", "#57606a"));
  }

  let cursor = top + Math.ceil(placed.length / perRow) * 120 + 10;
  for (const loop of loopsOf(spec, view)) {
    add(ctx, `<rect x="${PAD - 8}" y="${cursor}" width="${ctx.width - PAD * 2 + 16}" height="34" rx="6" fill="none" stroke="#8250df" stroke-dasharray="6 4" />`);
    add(ctx, text(PAD + 4, cursor + 21, `loop ${loop.id} over ${loop.over.join(", ")} — exit: ${loop.exit ?? ""}`, 11, "start", "#8250df"));
    cursor += 46;
  }
  cursor = legend(ctx, cursor + 8);
  cursor = bands(ctx, cursor);
  cursor = footer(ctx, cursor);
  return frame(ctx, cursor + PAD);
}

export const svgAdapter: RendererAdapter = {
  id: "svg",
  capabilities: { sequence: "native", state: "native", component: "native", deterministic: true },
  emit(spec, view) {
    const contents = view.kind === "sequence" ? sequenceView(spec, view) : nodeView(spec, view);
    return [{ path: `${view.id}.svg`, contents }];
  },
};
