export function makeTracePolicyLinksRepo(db) {
    const insert = db.prepare(`INSERT OR IGNORE INTO trace_policy_links
       (trace_id, policy_id, episode_id, created_at)
     VALUES (@trace_id, @policy_id, @episode_id, @created_at)`);
    const selectTraceIds = db.prepare(`SELECT trace_id
       FROM trace_policy_links
      WHERE policy_id=@policy_id
      ORDER BY created_at DESC, trace_id DESC`);
    const selectEpisodeIds = db.prepare(`SELECT DISTINCT episode_id
       FROM trace_policy_links
      WHERE policy_id=@policy_id
      ORDER BY episode_id`);
    const selectPolicyIds = db.prepare(`SELECT DISTINCT policy_id
       FROM trace_policy_links
      WHERE episode_id=@episode_id
      ORDER BY policy_id`);
    return {
        link(args) {
            insert.run({
                trace_id: args.traceId,
                policy_id: args.policyId,
                episode_id: args.episodeId,
                created_at: args.now ?? Date.now(),
            });
        },
        getWithTraceIds(policyId) {
            return selectTraceIds.all({ policy_id: policyId }).map((r) => r.trace_id);
        },
        getLinkedEpisodeIds(policyId) {
            return selectEpisodeIds.all({ policy_id: policyId }).map((r) => r.episode_id);
        },
        getLinkedPolicyIds(episodeId) {
            return selectPolicyIds.all({ episode_id: episodeId }).map((r) => r.policy_id);
        },
    };
}
//# sourceMappingURL=trace-policy-links.js.map