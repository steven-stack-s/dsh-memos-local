/**
 * The single schema for `config.yaml`. Used to:
 *   1. Validate user files at load time (`loadConfig`).
 *   2. Provide JSON Schema for editor autocomplete (writer can emit it).
 *   3. Generate the `templates/config.<agent>.yaml` defaults during code review.
 *
 * Adding fields: provide a default in `defaults.ts` (so old configs upgrade).
 * Removing fields: log a warning at load time; don't crash.
 */
import { type Static } from "@sinclair/typebox";
declare const ReasoningSchema: import("@sinclair/typebox").TObject<{
    /**
     * OpenRouter-compatible reasoning toggle. Omit the whole block to keep
     * the provider/model default.
     */
    enabled: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
    /** Optional provider effort hint for reasoning-capable models. */
    effort: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"minimal">, import("@sinclair/typebox").TLiteral<"none">, import("@sinclair/typebox").TLiteral<"low">, import("@sinclair/typebox").TLiteral<"medium">, import("@sinclair/typebox").TLiteral<"high">, import("@sinclair/typebox").TLiteral<"xhigh">, import("@sinclair/typebox").TLiteral<"max">]>>;
    /** Optional token budget for reasoning-capable providers. */
    maxTokens: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TNumber>;
}>;
export declare const ConfigSchema: import("@sinclair/typebox").TObject<{
    version: import("@sinclair/typebox").TNumber;
    viewer: import("@sinclair/typebox").TObject<{
        port: import("@sinclair/typebox").TNumber;
        bindHost: import("@sinclair/typebox").TString;
        openOnFirstTurn: import("@sinclair/typebox").TBoolean;
    }>;
    bridge: import("@sinclair/typebox").TObject<{
        port: import("@sinclair/typebox").TNumber;
        mode: import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"stdio">, import("@sinclair/typebox").TLiteral<"tcp">]>;
    }>;
    embedding: import("@sinclair/typebox").TObject<{
        provider: import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"local">, import("@sinclair/typebox").TLiteral<"openai_compatible">, import("@sinclair/typebox").TLiteral<"gemini">]>;
        endpoint: import("@sinclair/typebox").TString;
        model: import("@sinclair/typebox").TString;
        apiKey: import("@sinclair/typebox").TString;
        /** OpenRouter provider routing — providers to skip. */
        providerIgnore: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TArray<import("@sinclair/typebox").TString>>;
        /** OpenRouter provider routing — preferred order. */
        providerOrder: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TArray<import("@sinclair/typebox").TString>>;
        /** Explicitly enable OpenRouter fields for a reverse proxy or CNAME. */
        openRouter: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
        /**
         * Maximum estimated tokens in one provider input. `0` explicitly disables
         * client-side chunking. New installations default to a conservative 1024.
         */
        maxInputTokens: import("@sinclair/typebox").TNumber;
        /** Maximum physical texts sent in one embedding-provider HTTP request. */
        batchSize: import("@sinclair/typebox").TNumber;
        cache: import("@sinclair/typebox").TObject<{
            enabled: import("@sinclair/typebox").TBoolean;
            maxItems: import("@sinclair/typebox").TNumber;
        }>;
    }>;
    llm: import("@sinclair/typebox").TObject<{
        provider: import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"">, import("@sinclair/typebox").TLiteral<"local_only">, import("@sinclair/typebox").TLiteral<"openai_compatible">, import("@sinclair/typebox").TLiteral<"gemini">, import("@sinclair/typebox").TLiteral<"anthropic">, import("@sinclair/typebox").TLiteral<"bedrock">, import("@sinclair/typebox").TLiteral<"host">]>;
        endpoint: import("@sinclair/typebox").TString;
        model: import("@sinclair/typebox").TString;
        temperature: import("@sinclair/typebox").TNumber;
        /** When true, fall back to the agent host's LLM if `provider` fails. */
        fallbackToHost: import("@sinclair/typebox").TBoolean;
        apiKey: import("@sinclair/typebox").TString;
        /** Per-call timeout in ms. */
        timeoutMs: import("@sinclair/typebox").TNumber;
        /** Max retries on transient errors. */
        maxRetries: import("@sinclair/typebox").TNumber;
        /** OpenRouter provider routing — providers to skip. */
        providerIgnore: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TArray<import("@sinclair/typebox").TString>>;
        /** OpenRouter provider routing — preferred order. */
        providerOrder: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TArray<import("@sinclair/typebox").TString>>;
        /** Explicitly enable OpenRouter fields for a reverse proxy or CNAME. */
        openRouter: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
        /** Optional reasoning control (see ReasoningSchema). Omit = model default. */
        reasoning: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TObject<{
            /**
             * OpenRouter-compatible reasoning toggle. Omit the whole block to keep
             * the provider/model default.
             */
            enabled: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
            /** Optional provider effort hint for reasoning-capable models. */
            effort: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"minimal">, import("@sinclair/typebox").TLiteral<"none">, import("@sinclair/typebox").TLiteral<"low">, import("@sinclair/typebox").TLiteral<"medium">, import("@sinclair/typebox").TLiteral<"high">, import("@sinclair/typebox").TLiteral<"xhigh">, import("@sinclair/typebox").TLiteral<"max">]>>;
            /** Optional token budget for reasoning-capable providers. */
            maxTokens: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TNumber>;
        }>>;
        /** Max output tokens per completion (deepseek-v4-flash needs >= 100). */
        maxTokens: import("@sinclair/typebox").TNumber;
        /** Extra HTTP headers for the provider request. */
        headers: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TRecord<import("@sinclair/typebox").TString, import("@sinclair/typebox").TString>>;
    }>;
    /** Dedicated model slot for L3 abstraction. Same shape as skillEvolver. */
    l3Llm: import("@sinclair/typebox").TObject<{
        provider: import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"">, import("@sinclair/typebox").TLiteral<"openai_compatible">, import("@sinclair/typebox").TLiteral<"gemini">, import("@sinclair/typebox").TLiteral<"anthropic">]>;
        endpoint: import("@sinclair/typebox").TString;
        model: import("@sinclair/typebox").TString;
        apiKey: import("@sinclair/typebox").TString;
        temperature: import("@sinclair/typebox").TNumber;
        timeoutMs: import("@sinclair/typebox").TNumber;
        /** OpenRouter provider routing — providers to skip. */
        providerIgnore: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TArray<import("@sinclair/typebox").TString>>;
        /** OpenRouter provider routing — preferred order. */
        providerOrder: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TArray<import("@sinclair/typebox").TString>>;
        /** Explicitly enable OpenRouter fields for a reverse proxy or CNAME. */
        openRouter: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
        /** Optional reasoning control (see ReasoningSchema). Omit = model default. */
        reasoning: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TObject<{
            /**
             * OpenRouter-compatible reasoning toggle. Omit the whole block to keep
             * the provider/model default.
             */
            enabled: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
            /** Optional provider effort hint for reasoning-capable models. */
            effort: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"minimal">, import("@sinclair/typebox").TLiteral<"none">, import("@sinclair/typebox").TLiteral<"low">, import("@sinclair/typebox").TLiteral<"medium">, import("@sinclair/typebox").TLiteral<"high">, import("@sinclair/typebox").TLiteral<"xhigh">, import("@sinclair/typebox").TLiteral<"max">]>>;
            /** Optional token budget for reasoning-capable providers. */
            maxTokens: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TNumber>;
        }>>;
        /** Max output tokens per completion. */
        maxTokens: import("@sinclair/typebox").TNumber;
        /** Extra HTTP headers for the provider request. */
        headers: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TRecord<import("@sinclair/typebox").TString, import("@sinclair/typebox").TString>>;
    }>;
    skillEvolver: import("@sinclair/typebox").TObject<{
        provider: import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"">, import("@sinclair/typebox").TLiteral<"openai_compatible">, import("@sinclair/typebox").TLiteral<"gemini">, import("@sinclair/typebox").TLiteral<"anthropic">]>;
        endpoint: import("@sinclair/typebox").TString;
        model: import("@sinclair/typebox").TString;
        apiKey: import("@sinclair/typebox").TString;
        temperature: import("@sinclair/typebox").TNumber;
        timeoutMs: import("@sinclair/typebox").TNumber;
        /** OpenRouter provider routing — providers to skip. */
        providerIgnore: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TArray<import("@sinclair/typebox").TString>>;
        /** OpenRouter provider routing — preferred order. */
        providerOrder: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TArray<import("@sinclair/typebox").TString>>;
        /** Explicitly enable OpenRouter fields for a reverse proxy or CNAME. */
        openRouter: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
        /** Optional reasoning control (see ReasoningSchema). Omit = model default. */
        reasoning: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TObject<{
            /**
             * OpenRouter-compatible reasoning toggle. Omit the whole block to keep
             * the provider/model default.
             */
            enabled: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TBoolean>;
            /** Optional provider effort hint for reasoning-capable models. */
            effort: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"minimal">, import("@sinclair/typebox").TLiteral<"none">, import("@sinclair/typebox").TLiteral<"low">, import("@sinclair/typebox").TLiteral<"medium">, import("@sinclair/typebox").TLiteral<"high">, import("@sinclair/typebox").TLiteral<"xhigh">, import("@sinclair/typebox").TLiteral<"max">]>>;
            /** Optional token budget for reasoning-capable providers. */
            maxTokens: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TNumber>;
        }>>;
        /** Max output tokens per completion. */
        maxTokens: import("@sinclair/typebox").TNumber;
        /** Extra HTTP headers for the provider request. */
        headers: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TRecord<import("@sinclair/typebox").TString, import("@sinclair/typebox").TString>>;
    }>;
    storage: import("@sinclair/typebox").TObject<{
        /**
         * Keyword tokenizer mode used when compiling FTS5 MATCH expressions.
         * `trigram` preserves the historical SQLite trigram behavior; `cjk`
         * keeps short Chinese words and mixed ASCII+CJK tokens searchable.
         */
        ftsTokenizer: import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"trigram">, import("@sinclair/typebox").TLiteral<"cjk">]>;
    }>;
    algorithm: import("@sinclair/typebox").TObject<{
        lightweightMemory: import("@sinclair/typebox").TObject<{
            /**
             * Low-cost mode for users who only want raw conversation memory +
             * recall. When enabled, the runtime skips task/reward/L2/L3/skill
             * evolution and keeps only summarize + embedding + retrieval filter.
             * The viewer exposes the inverse as "memory self-evolution".
             */
            enabled: import("@sinclair/typebox").TBoolean;
        }>;
        capture: import("@sinclair/typebox").TObject<{
            /** Cap on agent/user text length (chars). Longer content is summarized. */
            maxTextChars: import("@sinclair/typebox").TNumber;
            /** Maximum tool outputs we keep verbatim per step. Extras are truncated. */
            maxToolOutputChars: import("@sinclair/typebox").TNumber;
            /** Embed state+action vectors when writing traces. Default on. */
            embedTraces: import("@sinclair/typebox").TBoolean;
            /** When true, ask the LLM to score α for each reflection. Default on. */
            alphaScoring: import("@sinclair/typebox").TBoolean;
            /** Synthesize reflections with the LLM if extractor found none. Default off. */
            synthReflections: import("@sinclair/typebox").TBoolean;
            /** Concurrency for α scoring + synth LLM calls (per_step mode only). */
            llmConcurrency: import("@sinclair/typebox").TNumber;
            /** Hard cap for one topic-end reflect pass, including recovery replay. */
            maxReflectLlmCalls: import("@sinclair/typebox").TNumber;
            /** Max orphan trace inserts allowed during startup-recovered replay. */
            maxRecoveryOrphanInserts: import("@sinclair/typebox").TNumber;
            /**
             * V7 §3.2 batched variant. When/how to fold per-step reflection synth +
             * α scoring into one episode-level LLM call:
             *   - "per_step"    : legacy path, N per-step LLM calls
             *   - "per_episode" : always batch
             *   - "auto"        : batch when stepCount ≤ batchThreshold, else per-step
             */
            batchMode: import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"per_step">, import("@sinclair/typebox").TLiteral<"per_episode">, import("@sinclair/typebox").TLiteral<"auto">]>;
            /**
             * Step-count cap for "auto" mode. Episodes above this limit fall back
             * to per-step calls so the batched prompt cannot overflow context.
             */
            batchThreshold: import("@sinclair/typebox").TNumber;
            /**
             * Optional context blocks for per-step reflection and α prompts.
             * Defaults to "task" to preserve the current task-summary enrichment;
             * downstream preview remains opt-in.
             */
            reflectionContextMode: import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"none">, import("@sinclair/typebox").TLiteral<"task">, import("@sinclair/typebox").TLiteral<"downstream">, import("@sinclair/typebox").TLiteral<"task_downstream">]>;
            /**
             * Long-episode fallback mode after batch auto-threshold is exceeded.
             * `per_step_downstream` keeps parallelism but adds step+1..step+3 preview.
             */
            longEpisodeReflectMode: import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"per_step_parallel">, import("@sinclair/typebox").TLiteral<"per_step_downstream">]>;
            /** Max downstream steps attached to a per-step prompt. */
            downstreamStepCount: import("@sinclair/typebox").TNumber;
            /** Character cap for the task-context block. */
            taskContextMaxChars: import("@sinclair/typebox").TNumber;
            /** Total character cap for all downstream preview blocks. */
            downstreamContextMaxChars: import("@sinclair/typebox").TNumber;
            /** Character cap per downstream preview block. */
            downstreamPerStepMaxChars: import("@sinclair/typebox").TNumber;
            /** Character cap for current-step tool outcome in synth / α prompts. */
            synthOutcomeMaxChars: import("@sinclair/typebox").TNumber;
        }>;
        reward: import("@sinclair/typebox").TObject<{
            /** V7 §0.6 eq. 4/5: discount factor γ for reflection-weighted backprop. */
            gamma: import("@sinclair/typebox").TNumber;
            /** V7 §2.4.5 eq. 3: temperature τ for softmax reweighting in L2 induction. */
            tauSoftmax: import("@sinclair/typebox").TNumber;
            /** V7 §3.3: priority decay half-life in days. */
            decayHalfLifeDays: import("@sinclair/typebox").TNumber;
            /** Ask LLM to score user feedback → R_human. Off falls back to polarity heuristics. */
            llmScoring: import("@sinclair/typebox").TBoolean;
            /** Auto-trigger backprop when R_human ≥ this from implicit signals. */
            implicitThreshold: import("@sinclair/typebox").TNumber;
            /**
             * Seconds to wait for explicit user feedback after `capture.done` before
             * falling back to implicit-signals scoring. 0 disables the timer.
             */
            feedbackWindowSec: import("@sinclair/typebox").TNumber;
            /** Max characters for the task summary fed into the human-scorer LLM. */
            summaryMaxChars: import("@sinclair/typebox").TNumber;
            /** Concurrency for human-scoring LLM calls. */
            llmConcurrency: import("@sinclair/typebox").TNumber;
            /**
             * Min user↔assistant *exchanges* before an episode is scored.
             * Shorter episodes are closed as abandoned. Default 1 — admits
             * single-shot CLI patterns (`hermes chat -q "..."`,
             * `openclaw run --once`) which always have exactly one
             * user-assistant pair. Set 2 for the strict legacy behaviour
             * (skip episodes that aren't a real back-and-forth).
             */
            minExchangesForCompletion: import("@sinclair/typebox").TNumber;
            /**
             * Min combined user+assistant content characters before scoring.
             * Filters trivial turns ("hi"/"ok"). Default 40 — pairs with the
             * relaxed exchanges floor; raise to 80+ if your workflow always
             * sends long prompts and you want stronger triviality gating.
             */
            minContentCharsForCompletion: import("@sinclair/typebox").TNumber;
            /**
             * Fraction of turns that are tool calls above which an episode is
             * considered "tool-heavy". When combined with low assistant text
             * the episode is skipped as noise. Default 0.7 (70%).
             */
            toolHeavyRatio: import("@sinclair/typebox").TNumber;
            /**
             * Minimum total assistant content chars to keep an episode that
             * would otherwise be flagged by the tool-heavy heuristic. If the
             * assistant wrote at least this many characters the episode is
             * scored normally even if tool calls dominate. Default 80.
             */
            minAssistantCharsForToolHeavy: import("@sinclair/typebox").TNumber;
        }>;
        l2Induction: import("@sinclair/typebox").TObject<{
            /** Cosine ≥ this to associate a new trace with an existing L2 policy. */
            minSimilarity: import("@sinclair/typebox").TNumber;
            /** TTL (days) for unpromoted rows in `l2_candidate_pool`. */
            candidateTtlDays: import("@sinclair/typebox").TNumber;
            /** Min distinct episodes in a candidate bucket before we run induction. */
            minEpisodesForInduction: import("@sinclair/typebox").TNumber;
            /** Ignore traces whose V is below this floor (prevents noise-driven L2). */
            minTraceValue: import("@sinclair/typebox").TNumber;
            /** When true, call the LLM to induce policies; else collect candidates only. */
            useLlm: import("@sinclair/typebox").TBoolean;
            /** Character cap for traces handed into the `l2.induction` prompt. */
            traceCharCap: import("@sinclair/typebox").TNumber;
            /** EMA alpha for gain updates. 1 means overwrite, lower values preserve history. */
            gainEmaAlpha: import("@sinclair/typebox").TNumber;
            /** Archive active policies whose gain dips below this value. */
            archiveGain: import("@sinclair/typebox").TNumber;
        }>;
        l3Abstraction: import("@sinclair/typebox").TObject<{
            /** Minimum number of compatible active L2 policies to trigger an L3 abstraction. */
            minPolicies: import("@sinclair/typebox").TNumber;
            /** Hard minimum gain for an L2 to be eligible as abstraction evidence. */
            minPolicyGain: import("@sinclair/typebox").TNumber;
            /** Hard minimum support for an L2 to be eligible as abstraction evidence. */
            minPolicySupport: import("@sinclair/typebox").TNumber;
            /**
             * Cosine ≥ this between two L2 vectors → same bucket. Buckets below this
             * are ignored (policies too disparate to share a world model).
             */
            clusterMinSimilarity: import("@sinclair/typebox").TNumber;
            /** Chars of L2 body handed to `l3.abstraction`. */
            policyCharCap: import("@sinclair/typebox").TNumber;
            /** Chars of trace body handed per evidence trace. */
            traceCharCap: import("@sinclair/typebox").TNumber;
            /** Max evidence traces in the prompt — one per policy. */
            traceEvidencePerPolicy: import("@sinclair/typebox").TNumber;
            /**
             * When true, call `l3.abstraction` to generate/update world models.
             * When false, buckets are logged but no LLM call fires — useful for
             * cost-sensitive deployments.
             */
            useLlm: import("@sinclair/typebox").TBoolean;
            /** Cooldown in days between L3 runs for the same domain tag. */
            cooldownDays: import("@sinclair/typebox").TNumber;
            /** Confidence delta per positive/negative user feedback. */
            confidenceDelta: import("@sinclair/typebox").TNumber;
            /** Below this confidence, a world model is hidden from Tier-3 retrieval. */
            minConfidenceForRetrieval: import("@sinclair/typebox").TNumber;
        }>;
        skill: import("@sinclair/typebox").TObject<{
            minSupport: import("@sinclair/typebox").TNumber;
            minGain: import("@sinclair/typebox").TNumber;
            /** Trials a skill must accumulate in `candidate` before it can graduate. */
            candidateTrials: import("@sinclair/typebox").TNumber;
            /** Back-off before we retry a failed-to-verify policy. */
            cooldownMs: import("@sinclair/typebox").TNumber;
            /** Chars per evidence trace fed into the crystallize prompt. */
            traceCharCap: import("@sinclair/typebox").TNumber;
            /** Max evidence traces per policy given to the LLM. */
            evidenceLimit: import("@sinclair/typebox").TNumber;
            /** Turn the LLM crystallization off (collect candidates only). */
            useLlm: import("@sinclair/typebox").TBoolean;
            /** η delta applied per user thumbs up/down. */
            etaDelta: import("@sinclair/typebox").TNumber;
            /** Archive an active skill whose η drops below this. */
            archiveEta: import("@sinclair/typebox").TNumber;
            /** Hide Tier-1 skills whose η is below this. Mirrors retrieval.minSkillEta. */
            minEtaForRetrieval: import("@sinclair/typebox").TNumber;
            /** Archive low-η active skills after this much retrieval inactivity (minimum 1 hour). */
            idleArchiveMs: import("@sinclair/typebox").TNumber;
        }>;
        feedback: import("@sinclair/typebox").TObject<{
            /** Raise a burst after this many failures of the same tool in-window. */
            failureThreshold: import("@sinclair/typebox").TNumber;
            /** Rolling window (number of steps) for the burst counter. */
            failureWindow: import("@sinclair/typebox").TNumber;
            /** Min |mean(high) - mean(low)| to fire without an explicit user signal. */
            valueDelta: import("@sinclair/typebox").TNumber;
            /**
             * Minimum absolute value threshold for lowValue traces. Only traces with
             * value < -minLowValueThreshold will be collected as failure evidence
             * (unless they match isFailureLike patterns). This filters out trivial
             * negative feedback (e.g., value = -0.001) and focuses on genuine failures.
             * Default 0.01 — adjust higher (e.g., 0.1) to be more conservative.
             */
            minLowValueThreshold: import("@sinclair/typebox").TNumber;
            /** Let the LLM rewrite the preference / anti-pattern lines. */
            useLlm: import("@sinclair/typebox").TBoolean;
            /** Tag the L2 policies referenced by the evidence with the guidance. */
            attachToPolicy: import("@sinclair/typebox").TBoolean;
            /** Debounce (ms) for repeat repairs on the same context hash. */
            cooldownMs: import("@sinclair/typebox").TNumber;
            /** Char cap per trace handed to the repair prompt. */
            traceCharCap: import("@sinclair/typebox").TNumber;
            /** Max evidence traces per class (high-value / low-value). */
            evidenceLimit: import("@sinclair/typebox").TNumber;
        }>;
        session: import("@sinclair/typebox").TObject<{
            /**
             * How a user's next message should relate to the previously closed
             * episode. Mirrors V7 §0.1 but softens the default so same-topic
             * follow-ups stay in one "task" from the user's POV.
             *
             *   - "merge_follow_ups" (default)  — both `revision` and `follow_up`
             *     reopen the previous episode and append the new turn. Only
             *     `new_task` opens a fresh episode/session. This matches the
             *     legacy `memos-local-openclaw` behaviour where one "task"
             *     aggregates many related turns and skills crystallise from a
             *     coherent transcript.
             *   - "episode_per_turn"           — follow-ups open a NEW episode in
             *     the same session (V7 §0.1 strict). Each user query gets its
             *     own R_human + V backprop pass. Useful when you want fine-grained
             *     credit assignment per sub-task.
             */
            followUpMode: import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"merge_follow_ups">, import("@sinclair/typebox").TLiteral<"episode_per_turn">]>;
            /**
             * Hard cap on how long a single merged episode can grow before we
             * force a new episode boundary even if relation says "follow_up".
             * Prevents infinite growth and keeps reward scoring tractable.
             * 0 disables the cap. Default: 2 hours — matches the legacy
             * `taskIdleTimeoutMs`.
             */
            mergeMaxGapMs: import("@sinclair/typebox").TNumber;
            /**
             * Hard cap on turns in a merged episode. Once reached, the next
             * turn forces a topic boundary even if relation classification says
             * follow-up/revision. Keeps task-end processing bounded.
             */
            maxTurnsPerEpisode: import("@sinclair/typebox").TNumber;
            /**
             * Max time to wait for relation classification before defaulting
             * to a conservative new-task boundary so foreground prompt
             * construction cannot stall indefinitely.
             */
            classifyTimeoutMs: import("@sinclair/typebox").TNumber;
            /**
             * Shared LLM concurrency budget for asynchronous background
             * capture/reward/L2/L3/skill-evolution processing.
             */
            bgLlmConcurrency: import("@sinclair/typebox").TNumber;
        }>;
        retrieval: import("@sinclair/typebox").TObject<{
            /** How many Skill snippets to inject at turn start. */
            tier1TopK: import("@sinclair/typebox").TNumber;
            /** How many trace/episode snippets to inject. */
            tier2TopK: import("@sinclair/typebox").TNumber;
            /** How many world-model snippets to inject. */
            tier3TopK: import("@sinclair/typebox").TNumber;
            /** Fetch K·factor candidates from SQLite before MMR/priority re-rank. */
            candidatePoolFactor: import("@sinclair/typebox").TNumber;
            /** Tier 2 fusion weight for cosine similarity (vs. priority). */
            weightCosine: import("@sinclair/typebox").TNumber;
            /** Tier 2 fusion weight for max(V,0)·decay(Δt) priority. */
            weightPriority: import("@sinclair/typebox").TNumber;
            /** MMR λ — 1 = pure relevance, 0 = pure diversity. */
            mmrLambda: import("@sinclair/typebox").TNumber;
            /** Hide V<0 traces by default (Decision Repair can override). */
            includeLowValue: import("@sinclair/typebox").TBoolean;
            /** Classic Reciprocal Rank Fusion constant. */
            rrfConstant: import("@sinclair/typebox").TNumber;
            /** Skip Tier-1 skills whose η is below this floor. */
            minSkillEta: import("@sinclair/typebox").TNumber;
            /** Drop Tier-2 hits whose cosine is below this floor. */
            minTraceSim: import("@sinclair/typebox").TNumber;
            /**
             * V7 §2.6 Tier 2b — minimum goal-level cosine for "episode replay"
             * to fire. Below this, we don't rollup episodes into a reference
             * action sequence (individual trace hits still go through).
             */
            episodeGoalMinSim: import("@sinclair/typebox").TNumber;
            /** auto | off | strict — controls tag-based pre-filtering. */
            tagFilter: import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"auto">, import("@sinclair/typebox").TLiteral<"off">, import("@sinclair/typebox").TLiteral<"strict">]>;
            /**
             * Per-tier keyword (FTS5 + pattern) channel size. Each tier issues
             * a vector channel + an FTS channel + a pattern channel; this is
             * the K for the keyword channels (vector still uses
             * `tier{1,2,3}TopK · candidatePoolFactor`).
             */
            keywordTopK: import("@sinclair/typebox").TNumber;
            /**
             * Drop ranked candidates whose blended `relevance` is below
             * `topRelevance * relativeThresholdFloor`. Adaptive cousin of
             * `minTraceSim` — when the best hit is weak, we keep more (lower
             * absolute floor); when there's a clear winner, we drop noise.
             * Set to 0 to disable the relative cutoff entirely.
             *
             * Default lowered to 0.2 with the 2026 ranker overhaul: the new
             * base formula already weighs channel-rank evidence (so a raw
             * FTS-only hit lands in a comparable range to a cosine-0.8 hit),
             * and the old 0.4 floor was over-pruning keyword matches with
             * modest V·decay.
             */
            relativeThresholdFloor: import("@sinclair/typebox").TNumber;
            /**
             * Tier-1 skill relevance blend weight for `η` (skill reliability).
             * Old default `0.4` made well-trodden skills outrank obviously-more-
             * relevant new ones. `0.15` keeps the η nudge but lets the query↔skill
             * cosine dominate.
             */
            skillEtaBlend: import("@sinclair/typebox").TNumber;
            /**
             * MMR Phase-A seed-by-tier policy. When `true`, only seed a tier
             * if its best candidate's relevance ≥ `poolTopRelevance *
             * smartSeedRatio` (see below). This prevents the ranker from
             * force-injecting a stale Tier-1 skill / Tier-3 world-model just
             * because it cleared the absolute floors.
             */
            smartSeed: import("@sinclair/typebox").TBoolean;
            /**
             * Seed cutoff for smart-seed MMR — tier is seeded iff its best
             * candidate's relevance ≥ `poolTopRelevance * smartSeedRatio`.
             * Independent of `relativeThresholdFloor` so the seed gate can be
             * stricter than the generic drop floor (0.7 is "within 30% of the
             * best available candidate anywhere in the pool").
             */
            smartSeedRatio: import("@sinclair/typebox").TNumber;
            /**
             * When a candidate is surfaced by ≥ 2 retrieval channels (e.g.
             * both vec and fts hit the same trace), bypass the relative
             * threshold. Multi-channel agreement is a strong signal, and
             * without this keyword-only matches with modest V·decay often
             * get dropped by a noisy `topRelevance`.
             */
            multiChannelBypass: import("@sinclair/typebox").TBoolean;
            /**
             * How Tier-1 skills are surfaced in the injected prompt:
             *   - "summary" (default): inject only `name + η + 1-line summary +
             *     a `memos_skill_get(id="…")` hint`. The agent decides whether to
             *     fetch the full procedure via the `memos_skill_get` tool. Keeps the
             *     prompt small and avoids paying for skills the agent never
             *     uses.
             *   - "full": inline the entire `invocationGuide` body (legacy
             *     behaviour — useful for hosts that don't support tool calls).
             */
            skillInjectionMode: import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"summary">, import("@sinclair/typebox").TLiteral<"full">]>;
            /**
             * Char cap for the per-skill summary body when `skillInjectionMode`
             * is `summary`. We trim the first paragraph of `invocationGuide`
             * and clamp to this many chars before appending the call-hint.
             */
            skillSummaryChars: import("@sinclair/typebox").TNumber;
            /**
             * LLM-based relevance filter (`core/retrieval/llm-filter.ts`).
             * Default on because cosine retrieval over-matches and a single
             * small LLM call dramatically cuts down irrelevant injections.
             */
            llmFilterEnabled: import("@sinclair/typebox").TBoolean;
            /** Keep at most this many candidates after the LLM filter. */
            llmFilterMaxKeep: import("@sinclair/typebox").TNumber;
            /**
             * Skip the filter when the ranked list has fewer than this many
             * items. Default 1 — even a single candidate gets a precision
             * pass, matching `memos-local-openclaw`'s tool-level filter and
             * preventing a lone off-topic memory from sneaking through
             * unchecked.
             */
            llmFilterMinCandidates: import("@sinclair/typebox").TNumber;
            /**
             * Body-text budget per candidate when building the LLM filter
             * prompt. Higher = more context for precise judgement, at the
             * cost of more tokens per round-trip. Default 500 (openclaw uses
             * 300 without tags/channels; we include richer metadata, so a
             * slightly larger window pays for itself).
             */
            llmFilterCandidateBodyChars: import("@sinclair/typebox").TNumber;
            /**
             * Tier-2 vector scan time-window bound (ms). When > 0, the
             * vector scan path (`scanAndTopK` in `core/storage/vector.ts`)
             * only considers traces written within the last
             * `vectorScanMaxAgeMs` milliseconds. Set to `0` to disable the
             * cap (legacy behaviour: full-table brute-force scan).
             *
             * Background: at 93K rows × 1536 dims the unbounded scan blocks
             * the Node event loop for 5–30 s every `onTurnStart`
             * (https://github.com/MemTensor/MemOS/issues/1929). A 24-hour
             * window keeps onTurnStart latency under control without
             * sacrificing recall for active-session memories. FTS keyword
             * channels still cover older traces, so this bound only affects
             * the cosine-only path.
             *
             * Hard cap is one year (31_536_000_000 ms) — anything larger is
             * indistinguishable from "unbounded" at the corpus sizes where
             * the bound starts to matter, and accepting absurdly large
             * values lets misconfigured deployments silently revert to the
             * old behaviour.
             */
            vectorScanMaxAgeMs: import("@sinclair/typebox").TNumber;
        }>;
    }>;
    hub: import("@sinclair/typebox").TObject<{
        enabled: import("@sinclair/typebox").TBoolean;
        role: import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"hub">, import("@sinclair/typebox").TLiteral<"client">]>;
        port: import("@sinclair/typebox").TNumber;
        address: import("@sinclair/typebox").TString;
        teamName: import("@sinclair/typebox").TString;
        teamToken: import("@sinclair/typebox").TString;
        userToken: import("@sinclair/typebox").TString;
        nickname: import("@sinclair/typebox").TString;
    }>;
    telemetry: import("@sinclair/typebox").TObject<{
        enabled: import("@sinclair/typebox").TBoolean;
    }>;
    logging: import("@sinclair/typebox").TObject<{
        level: import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"trace">, import("@sinclair/typebox").TLiteral<"debug">, import("@sinclair/typebox").TLiteral<"info">, import("@sinclair/typebox").TLiteral<"warn">, import("@sinclair/typebox").TLiteral<"error">, import("@sinclair/typebox").TLiteral<"fatal">]>;
        /** Viewer-only switch: expose detailed logs, lifecycle tags and chain view. */
        detailedView: import("@sinclair/typebox").TBoolean;
        /** IANA timezone for log timestamp display. */
        timezone: import("@sinclair/typebox").TString;
        console: import("@sinclair/typebox").TObject<{
            enabled: import("@sinclair/typebox").TBoolean;
            pretty: import("@sinclair/typebox").TBoolean;
            channels: import("@sinclair/typebox").TArray<import("@sinclair/typebox").TString>;
        }>;
        file: import("@sinclair/typebox").TObject<{
            enabled: import("@sinclair/typebox").TBoolean;
            format: import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"json">, import("@sinclair/typebox").TLiteral<"compact">]>;
            rotate: import("@sinclair/typebox").TObject<{
                maxSizeMb: import("@sinclair/typebox").TNumber;
                maxFiles: import("@sinclair/typebox").TNumber;
                gzip: import("@sinclair/typebox").TBoolean;
            }>;
            /** Days to keep regular app/error/perf/llm/events files. */
            retentionDays: import("@sinclair/typebox").TNumber;
        }>;
        audit: import("@sinclair/typebox").TObject<{
            enabled: import("@sinclair/typebox").TBoolean;
            /** Audit retention is "forever": rotate by month, gzip; never delete. */
            rotate: import("@sinclair/typebox").TObject<{
                monthly: import("@sinclair/typebox").TBoolean;
                gzip: import("@sinclair/typebox").TBoolean;
            }>;
        }>;
        llmLog: import("@sinclair/typebox").TObject<{
            enabled: import("@sinclair/typebox").TBoolean;
            redactPrompts: import("@sinclair/typebox").TBoolean;
            redactCompletions: import("@sinclair/typebox").TBoolean;
        }>;
        perfLog: import("@sinclair/typebox").TObject<{
            enabled: import("@sinclair/typebox").TBoolean;
            sampleRate: import("@sinclair/typebox").TNumber;
        }>;
        eventsLog: import("@sinclair/typebox").TObject<{
            enabled: import("@sinclair/typebox").TBoolean;
        }>;
        redact: import("@sinclair/typebox").TObject<{
            extraKeys: import("@sinclair/typebox").TArray<import("@sinclair/typebox").TString>;
            extraPatterns: import("@sinclair/typebox").TArray<import("@sinclair/typebox").TString>;
        }>;
        /** Per-channel level overrides, e.g. `{ "core.l2.cross-task": "debug" }`. */
        channels: import("@sinclair/typebox").TRecord<import("@sinclair/typebox").TString, import("@sinclair/typebox").TString>;
    }>;
}>;
export type ReasoningConfig = Static<typeof ReasoningSchema>;
export type ResolvedConfig = Static<typeof ConfigSchema>;
export {};
//# sourceMappingURL=schema.d.ts.map