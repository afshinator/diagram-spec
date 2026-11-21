import { byCodeUnit, type DiagramContent } from "./schema.ts";
import { plan, type Artifact, type EmitFile, type PlanEntry, type Registry } from "./plan.ts";
import { registry } from "./renderers/index.ts";
import { validate } from "./validate.ts";

export type EmitResult = { files: EmitFile[]; errors: string[] };

type Prepared = { entries: PlanEntry[]; spec: DiagramContent } | { errors: string[] };

/** The one path from raw content to resolved pairings; emit and render share it. */
function prepare(raw: unknown, adapters: Registry): Prepared {
  const checked = validate(raw, { adapters });
  if (!checked.ok || !checked.spec) {
    return { errors: checked.errors.map((error) => `${error.path}: ${error.reason}`) };
  }
  const resolved = plan(checked.spec, adapters);
  const errors = resolved.entries
    .filter((entry) => entry.refused)
    .map((entry) => `renderers.${entry.view.id}: ${entry.refused?.reason ?? "refused"}`);
  return errors.length ? { errors } : { entries: resolved.entries, spec: checked.spec };
}

const byteSize = (contents: string) => new TextEncoder().encode(contents).length;

/** Validate, resolve pairings, then let each adapter turn content into source. */
export function emit(raw: unknown, opts: { adapters?: Registry } = {}): EmitResult {
  const prepared = prepare(raw, opts.adapters ?? registry);
  if ("errors" in prepared) return { files: [], errors: prepared.errors };
  const files = prepared.entries.flatMap((entry) => entry.adapter?.emit(prepared.spec, entry.view) ?? []);
  files.sort((a, b) => byCodeUnit(a.path, b.path));
  return { files, errors: [] };
}

export async function render(
  raw: unknown,
  outDir: string,
  opts: { adapters?: Registry } = {},
): Promise<{ artifacts: Artifact[]; files: EmitFile[]; errors: string[] }> {
  const prepared = prepare(raw, opts.adapters ?? registry);
  if ("errors" in prepared) return { artifacts: [], files: [], errors: prepared.errors };

  const artifacts: Artifact[] = [];
  const files: EmitFile[] = [];
  try {
    for (const entry of prepared.entries) {
      if (!entry.adapter) continue;
      const produced = entry.adapter.emit(prepared.spec, entry.view);
      files.push(...produced);
      if (entry.adapter.render) {
        artifacts.push(...(await entry.adapter.render(produced, outDir)));
        continue;
      }
      for (const file of produced) {
        await Bun.write(`${outDir}/${file.path}`, file.contents);
        artifacts.push({ path: `${outDir}/${file.path}`, bytes: byteSize(file.contents) });
      }
    }
  } catch (error) {
    // A missing external tool is a configuration error, not a stack trace.
    return { artifacts: [], files, errors: [(error as Error).message] };
  }
  files.sort((a, b) => byCodeUnit(a.path, b.path));
  artifacts.sort((a, b) => byCodeUnit(a.path, b.path));
  return { artifacts, files, errors: [] };
}
