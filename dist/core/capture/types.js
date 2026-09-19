/**
 * Internal DTOs for `core/capture`.
 *
 * These are the stage-to-stage contracts between:
 *   step-extractor → normalizer → reflection-extractor → (reflection-synth?)
 *                 → alpha-scorer → embedder → traces repo
 *
 * Not exported through the plugin's public surface (adapters don't care).
 * Exposed to Phase 15 via the pipeline event bus as `CaptureResult` so the
 * orchestrator can chain reward / l2.incremental onto it.
 */
export {};
//# sourceMappingURL=types.js.map