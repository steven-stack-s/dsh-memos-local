import type { PromptDef } from "./index.js";
/**
 * V7 §7.2 — Skill crystallization.
 *
 * When a policy has accumulated enough supporting evidence (support ≥
 * skill.minSupport) and enough reward lift (gain ≥ skill.minGain), promote
 * it into a callable "Skill" with a stable name, parameter schema, and a
 * small SKILL.md authored from the evidence.
 *
 * **v3** adds an explicit `tools` output field: the LLM must declare which
 * tools/commands the skill invokes, constrained to the `EVIDENCE_TOOLS`
 * whitelist extracted from evidence trace `toolCalls`. This replaces the
 * old regex-based command-token heuristic in the verifier — coverage is now
 * a clean set-containment check (`draft.tools ⊆ evidenceTools`).
 *
 * v2 history: added `decision_guidance` (preference + anti-pattern).
 */
export declare const SKILL_CRYSTALLIZE_PROMPT: PromptDef;
//# sourceMappingURL=skill-crystallize.d.ts.map