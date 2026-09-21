/**
 * Regression (#2131): viewer panels must not depend on the core's
 * turn-scoped active namespace.
 *
 * Background: the DSH adapter boots the core with the configured
 * \`profileId\` (e.g. "default"), while rows are actually owned by the
 * session's \`agentPreset\` (e.g. "standard"). Until the first turn
 * flips \`activeNamespace\`, namespace-scoped reads see nothing.
 *
 * The Overview cards pinned \`includeAllNamespaces: true\` and so showed
 * non-zero counts, while the Skills / Experiences / Environment-knowledge
 * *lists* did not — they rendered empty until a conversation flipped the
 * namespace (the reported "talking one more round fixes it" symptom).
 *
 * The core's namespace isolation itself is intended behaviour and is
 * unchanged; the routes are what had to align with overview.ts /
 * trace.ts / session.ts.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createMemoryCore, createPipeline, type PipelineDeps, type PipelineHandle }
  from "../../../core/pipeline/index.js";
import type { MemoryCore } from "../../../agent-contract/memory-core.js";
import { rootLogger } from "../../../core/logger/index.js";
import { DEFAULT_CONFIG } from "../../../core/config/defaults.js";
import { resolveHome } from "../../../core/config/paths.js";
import { makeTmpDb, type TmpDbHandle } from "../../helpers/tmp-db.js";
import { fakeEmbedder } from "../../helpers/fake-embedder.js";

let db: TmpDbHandle | null = null;
let pipeline: PipelineHandle | null = null;
let core: MemoryCore | null = null;

function buildDeps(h: TmpDbHandle): PipelineDeps {
  const config = { ...DEFAULT_CONFIG, algorithm: { ...DEFAULT_CONFIG.algorithm,
    lightweightMemory: { ...DEFAULT_CONFIG.algorithm.lightweightMemory, enabled: false } } };
  return { agent: "deepseek-harness", home: resolveHome("deepseek-harness", "/tmp/memos-ns"),
    config, db: h.db, repos: h.repos, llm: null, reflectLlm: null,
    embedder: fakeEmbedder({ dimensions: 384 }),
    log: rootLogger.child({ channel: "test.ns" }),
    // Boot namespace = the configured profileId, which differs from the
    // profile that owns the rows.
    namespace: { agentKind: "deepseek-harness", profileId: "default" },
    now: () => 1_700_000_000_000 };
}

beforeEach(() => { db = makeTmpDb({ agent: "deepseek-harness" }); });
afterEach(() => { core = null; pipeline = null; db?.cleanup(); db = null; });

function seedOwnedRows(): void {
  const repos = db!.repos;
  const owner = { ownerAgentKind: "deepseek-harness", ownerProfileId: "standard" };
  repos.skills.upsert({ id: "sk-1", name: "deploy", invocationGuide: "g",
    procedureJson: null, status: "active", eta: 0.5, support: 1, gain: 1,
    trialsAttempted: 0, trialsPassed: 0, sourcePolicyIds: [], sourceWorldModelIds: [],
    evidenceAnchors: [], vec: null, createdAt: 1, updatedAt: 1, version: 1,
    ...owner } as never);
  repos.policies.upsert({ id: "po-1", title: "t", trigger: "tr", procedure: "p",
    verification: "v", boundary: "b", status: "active", support: 1, gain: 1,
    sourceEpisodeIds: [], inducedBy: "test",
    decisionGuidance: { preference: [], antiPattern: [] }, vec: null,
    createdAt: 1, updatedAt: 1, ...owner } as never);
  repos.worldModel.upsert({ id: "wm-1", title: "w", body: "b",
    structure: { environment: [], inference: [], constraints: [] },
    domainTags: [], confidence: 0.8, policyIds: [], sourceEpisodeIds: [],
    inducedBy: "test", vec: null, createdAt: 1, updatedAt: 1, version: 1,
    status: "active", ...owner } as never);
}

describe("viewer panel reads use the all-namespace convention (#2131)", () => {
  it("boot namespace (default) does not hide rows owned by another profile", async () => {
    pipeline = createPipeline(buildDeps(db!));
    core = createMemoryCore(pipeline, resolveHome("deepseek-harness", "/tmp/memos-ns"), "test");
    await core.init();
    seedOwnedRows();

    // Precondition: the active namespace really is the mismatching one.
    expect((await core.health()).namespace?.profileId).toBe("default");

    // 1. Namespace-scoped reads DO hide the rows — this is the core's
    //    intended isolation, and it is exactly what the panels used to
    //    hit. Locking it in keeps the regression test honest: if the
    //    core ever stopped isolating, this would fail loudly.
    expect(await core.listSkills({ limit: 50 })).toHaveLength(0);
    expect(await core.listPolicies({ limit: 50, offset: 0 })).toHaveLength(0);
    expect(await core.listWorldModels({ limit: 50, offset: 0 })).toHaveLength(0);

    // 2. What the ROUTES now ask for: all-namespace reads return the
    //    rows regardless of which namespace processed the last turn —
    //    so the panels render on a fresh boot, before any conversation.
    expect(await core.listSkills({ limit: 50, includeAllNamespaces: true })).toHaveLength(1);
    expect(await core.listPolicies({ limit: 50, offset: 0, includeAllNamespaces: true }))
      .toHaveLength(1);
    expect(await core.listWorldModels({ limit: 50, offset: 0, includeAllNamespaces: true }))
      .toHaveLength(1);

    // 3. ...and the counts behind the Overview cards agree with the
    //    lists, which is the whole point: the card and the panel can no
    //    longer disagree.
    expect(await core.countSkills({ includeAllNamespaces: true })).toBe(1);
    expect(await core.countPolicies({ includeAllNamespaces: true })).toBe(1);
    expect(await core.countWorldModels({ includeAllNamespaces: true })).toBe(1);
  });

  it("an explicit namespace filter still narrows an all-namespace read", async () => {
    pipeline = createPipeline(buildDeps(db!));
    core = createMemoryCore(pipeline, resolveHome("deepseek-harness", "/tmp/memos-ns"), "test");
    await core.init();
    seedOwnedRows();

    // The toolbar dropdown must keep working: matching profile returns
    // the row, a non-matching one returns nothing.
    expect(await core.listSkills({
      limit: 50, includeAllNamespaces: true,
      ownerAgentKind: "deepseek-harness", ownerProfileId: "standard",
    })).toHaveLength(1);
    expect(await core.listSkills({
      limit: 50, includeAllNamespaces: true,
      ownerAgentKind: "deepseek-harness", ownerProfileId: "ptc",
    })).toHaveLength(0);
  });
});
