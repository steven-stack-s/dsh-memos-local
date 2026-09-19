/**
 * `reflection-extractor` — try to lift a self-reflection out of the
 * assistant text for free (no LLM required).
 *
 * The V7 spec defines a reflection as "the agent's own explanation of
 * why it made this decision". Hosts sometimes emit this inline:
 *   - An OpenClaw assistant block containing `### Reasoning:` or
 *     `I chose this because …`.
 *   - A Hermes `<reflection>…</reflection>` tag (legacy).
 *   - A Chinese-language agent producing "我这样做是因为…" or "思考过程：".
 *
 * We recognise a handful of high-precision patterns and return the cleaned
 * snippet. Never throws, never invokes an LLM.
 *
 * If the step already has `rawReflection` set (from adapter-provided meta),
 * that wins unchanged.
 */
import type { NormalizedStep } from "./types.js";
/**
 * Extract a reflection from the step. Prefers the adapter-provided value;
 * falls back to parsing `agentText`. Returns `null` when no signal found.
 */
export declare function extractReflection(step: NormalizedStep): string | null;
//# sourceMappingURL=reflection-extractor.d.ts.map