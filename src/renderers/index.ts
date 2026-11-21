import type { Registry } from "../plan.ts";
import { d2Adapter } from "./d2.ts";
import { mermaidAdapter } from "./mermaid.ts";
import { svgAdapter } from "./svg.ts";

export const adapters = [d2Adapter, mermaidAdapter, svgAdapter];

export const registry: Registry = Object.fromEntries(adapters.map((adapter) => [adapter.id, adapter]));
