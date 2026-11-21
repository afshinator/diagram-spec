import { z } from "zod";

// The schema is deliberately generic: no project vocabulary, actor names or
// event names live here. Everything a diagram is about is declared in the YAML.

const VIEW_KINDS = ["sequence", "state", "component"] as const;
const FLOW_CLASSES = ["control", "report", "query", "verdict", "data"] as const;
const ACTOR_KINDS = ["human", "service", "store", "actor"] as const;
const READING_DIRECTIONS = ["top-down", "left-right"] as const;

const View = z.object({
  id: z.string().min(1),
  kind: z.enum(VIEW_KINDS),
  caption: z.string().min(1),
});

const Actor = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  // Optional so the validator can name the omission instead of zod failing first.
  role: z.string().optional(),
  kind: z.enum(ACTOR_KINDS).default("actor"),
});

const VocabularyEntry = z.object({
  label: z.string().min(1),
  kind: z.enum(FLOW_CLASSES),
  symmetric: z.boolean().default(false),
});

const Message = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  label: z.string().min(1),
  view: z.string().min(1),
});

const Loop = z.object({
  id: z.string().min(1),
  over: z.array(z.string().min(1)).default([]),
  exit: z.string().optional(),
  view: z.string().min(1),
});

const Terminal = z.object({
  actor: z.string().min(1),
  action: z.string().min(1),
  produces: z.array(z.string()).default([]),
});

const Band = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  membership: z.array(z.string().min(1)).default([]),
  definition: z.string().optional(),
  view: z.string().optional(),
});

const LegendEntry = z.object({
  class: z.enum(FLOW_CLASSES),
  meaning: z.string().min(1),
});

const RendererChoice = z.object({
  adapter: z.string().min(1),
});

const DiagramSchema = z.object({
  meta: z.object({
    title: z.string().min(1),
    subtitle: z.string().optional(),
    source_of_truth: z.array(z.string()).default([]),
    reading_direction: z.enum(READING_DIRECTIONS).optional(),
  }),
  views: z.array(View).default([]),
  actors: z.array(Actor).default([]),
  vocabulary: z.array(VocabularyEntry).default([]),
  messages: z.array(Message).default([]),
  loops: z.array(Loop).default([]),
  terminal: z.array(Terminal).default([]),
  bands: z.array(Band).default([]),
  legend: z.array(LegendEntry).default([]),
  renderers: z.record(z.string(), RendererChoice).default({}),
});

export type DiagramContent = z.infer<typeof DiagramSchema>;
export type View = z.infer<typeof View>;
export type Message = z.infer<typeof Message>;
export type Loop = z.infer<typeof Loop>;
export type Band = z.infer<typeof Band>;
export type ViewKind = (typeof VIEW_KINDS)[number];
export type FlowClass = (typeof FLOW_CLASSES)[number];

/** A view kind that can express iteration. Everything else is a picture of parts. */
export function iterable(kind: ViewKind): boolean {
  return kind === "sequence" || kind === "state";
}

/** Locale-independent ordering: emitted bytes must not depend on the host ICU/locale. */
export const byCodeUnit = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export type ParseResult = { ok: true; spec: DiagramContent } | { ok: false; errors: ParseError[] };

export type ParseError = { path: string; reason: string };

export function parseValue(raw: unknown): ParseResult {
  const parsed = DiagramSchema.safeParse(raw ?? {});
  if (parsed.success) return { ok: true, spec: parsed.data };
  return {
    ok: false,
    errors: parsed.error.issues.map((issue) => ({
      path: issue.path.length ? issue.path.join(".") : "diagram-content.yaml",
      reason: issue.message,
    })),
  };
}
