/**
 * `core/skill` public entry point.
 *
 * The Skill module owns V7 §2.5's crystallization + lifecycle. See
 * `README.md` for a tour and `ALGORITHMS.md` for the math.
 */
export { crystallizeDraft, defaultDraftValidator, } from "./crystallize.js";
export { evaluateEligibility, } from "./eligibility.js";
export { gatherEvidence, } from "./evidence.js";
export { applyFeedback, recomputeEta, shouldArchiveIdle, shouldPromoteCandidate, } from "./lifecycle.js";
export { buildSkillRow, } from "./packager.js";
export { applySkillFeedback, runSkill, } from "./skill.js";
export { attachSkillSubscriber } from "./subscriber.js";
export { createSkillEventBus } from "./events.js";
export { extractToolNames } from "./tool-names.js";
export { verifyDraft, } from "./verifier.js";
//# sourceMappingURL=index.js.map