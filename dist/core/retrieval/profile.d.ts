import type { RetrievalProfile } from "./types.js";
/**
 * Conservative, deterministic routing for query-specific retrieval policy.
 *
 * Only high-confidence first-person facts are specialised. Everything else
 * stays on the legacy/default route so troubleshooting and task recall do not
 * accidentally lose Tier-1 skills.
 */
export declare function classifyRetrievalProfile(userText: string): RetrievalProfile;
//# sourceMappingURL=profile.d.ts.map