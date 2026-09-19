/**
 * V7 §2.5.4 — Skill lifecycle.
 *
 * A skill moves through three visible states: `candidate`, `active`,
 * `archived`. Transitions are driven by:
 *
 *   - **Trials**: `trialsAttempted` grows on every `trial.pass` / `trial.fail`
 *     feedback signal. Once `trialsAttempted >= candidateTrials` we check
 *     the success ratio + η and promote to `active` or bounce back.
 *   - **Reward**: `reward.updated` on the source policy bubbles into
 *     `recomputeEta`, which re-seeds η from the policy's updated gain.
 *   - **User thumbs**: direct `user.positive` / `user.negative` signals
 *     adjust η by `etaDelta`.
 *
 * Everything here is pure over a `SkillRow`. The orchestrator calls these
 * helpers inside a `tx` so updates are atomic and auditable.
 */
/**
 * Apply one feedback signal to a skill. Returns the post-update state.
 */
export function applyFeedback(skill, kind, cfg, magnitude) {
    switch (kind) {
        case "trial.pass":
            return applyTrial(skill, true, cfg);
        case "trial.fail":
            return applyTrial(skill, false, cfg);
        case "user.positive":
            return applyThumbs(skill, +1, cfg, magnitude);
        case "user.negative":
            return applyThumbs(skill, -1, cfg, magnitude);
        case "reward.updated":
            return applyRewardDrift(skill, cfg, magnitude ?? 0);
        default:
            return snapshot(skill);
    }
}
function applyTrial(skill, passed, cfg) {
    const trialsAttempted = skill.trialsAttempted + 1;
    const trialsPassed = skill.trialsPassed + (passed ? 1 : 0);
    const eta = trialEtaWithPrior(skill.eta, skill.trialsAttempted, skill.trialsPassed, trialsAttempted, trialsPassed);
    let status = skill.status;
    let transition;
    if (status === "candidate" && trialsAttempted >= cfg.candidateTrials) {
        if (eta >= cfg.minEtaForRetrieval) {
            status = "active";
            transition = "promoted";
        }
        else {
            status = "archived";
            transition = "archived";
        }
    }
    if (status === "active" && eta < cfg.archiveEta) {
        status = "archived";
        transition = "archived";
    }
    return { status, eta, trialsAttempted, trialsPassed, transition };
}
function trialEtaWithPrior(currentEta, previousAttempts, previousPasses, nextAttempts, nextPasses) {
    // Treat the pre-trial η as one pseudo-observation, then fold in the
    // accumulated trial record. This preserves the skill's policy-derived
    // prior while still letting repeated real outcomes dominate.
    const priorStrength = 1;
    const priorEta = clamp01(currentEta * (priorStrength + previousAttempts) - previousPasses);
    return clamp01((priorEta * priorStrength + nextPasses) / (priorStrength + nextAttempts));
}
function applyThumbs(skill, sign, cfg, magnitudeOverride) {
    const delta = (magnitudeOverride ?? cfg.etaDelta) * sign;
    const eta = clamp01(skill.eta + delta);
    let status = skill.status;
    let transition;
    if (skill.status === "archived" && eta >= cfg.minEtaForRetrieval) {
        status = "candidate";
        transition = "promoted";
    }
    else if (skill.status !== "archived" && eta < cfg.archiveEta) {
        status = "archived";
        transition = "archived";
    }
    return {
        status,
        eta,
        trialsAttempted: skill.trialsAttempted,
        trialsPassed: skill.trialsPassed,
        transition,
    };
}
function applyRewardDrift(skill, cfg, magnitude) {
    const bounded = clamp01(magnitude);
    // Blend eta with the new policy gain (70% old, 30% new). This avoids
    // whiplash on a single noisy reward update.
    const eta = clamp01(0.7 * skill.eta + 0.3 * bounded);
    let status = skill.status;
    let transition;
    if (skill.status !== "archived" && eta < cfg.archiveEta) {
        status = "archived";
        transition = "demoted";
    }
    return {
        status,
        eta,
        trialsAttempted: skill.trialsAttempted,
        trialsPassed: skill.trialsPassed,
        transition,
    };
}
function snapshot(skill) {
    return {
        status: skill.status,
        eta: skill.eta,
        trialsAttempted: skill.trialsAttempted,
        trialsPassed: skill.trialsPassed,
    };
}
/**
 * Recompute the η a freshly-built skill should carry given its source
 * policy's latest gain + support. Used when we detect policy drift large
 * enough to rebuild a skill.
 */
export function recomputeEta(skill, policy, cfg) {
    if (skill.trialsAttempted > 0)
        return clamp01(skill.eta);
    const baseline = clamp01(policy.gain);
    return clamp01(Math.max(cfg.minEtaForRetrieval, baseline));
}
/**
 * Decide if a skill has decayed enough to archive without any new
 * evidence (e.g. it has been inactive with a low-eta source policy).
 * Used by the orchestrator's periodic `lifecycle.tick`.
 */
export function shouldArchiveIdle(skill, idleMs, cfg, now) {
    if (skill.status !== "active")
        return false;
    const idleSince = skill.lastUsedAt ?? skill.createdAt;
    const age = now - idleSince;
    if (age < idleMs)
        return false;
    return skill.eta < cfg.minEtaForRetrieval;
}
/**
 * Decide whether a non-repair candidate skill should skip trial
 * and become active immediately.  `eta` already encodes the
 * gain / support of the source policies (initialised at
 * crystallisation and kept current by reward drift), so we
 * don't need a separate gain / support gate.
 */
export function shouldPromoteCandidate(skill, cfg) {
    if (skill.status !== "candidate")
        return false;
    if (hasDecisionGuidance(skill))
        return false;
    return skill.eta >= cfg.minEtaForRetrieval;
}
function hasDecisionGuidance(skill) {
    const procedure = skill.procedureJson;
    if (!procedure || typeof procedure !== "object")
        return false;
    const guidance = procedure.decisionGuidance;
    return Boolean((Array.isArray(guidance?.preference) && guidance.preference.length > 0) ||
        (Array.isArray(guidance?.antiPattern) && guidance.antiPattern.length > 0));
}
function clamp01(n) {
    if (!Number.isFinite(n))
        return 0;
    if (n < 0)
        return 0;
    if (n > 1)
        return 1;
    return n;
}
//# sourceMappingURL=lifecycle.js.map