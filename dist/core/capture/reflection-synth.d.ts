/**
 * `reflection-synth` — optionally ask the LLM to WRITE a reflection when
 * the agent turn contained none. Off by default (costly).
 *
 * This is strictly a fallback path; the extractor runs first.
 *
 * The prompt is deliberately minimal — we don't want the LLM to grade or
 * judge (that's `alpha-scorer`), just to produce a first-person
 * "here's what I was trying to do" summary. The α scorer gets the next
 * crack and can still mark it unusable.
 */
import type { LlmClient } from "../llm/index.js";
import type { NormalizedStep, ReflectionContext } from "./types.js";
export interface SynthesizedReflection {
    text: string | null;
    model: string;
}
export interface ReflectionSynthContext extends ReflectionContext {
    episodeId?: string;
    phase?: string;
    outcomeMaxChars?: number;
}
export declare function synthesizeReflection(llm: LlmClient, step: NormalizedStep, context?: ReflectionSynthContext): Promise<SynthesizedReflection>;
//# sourceMappingURL=reflection-synth.d.ts.map