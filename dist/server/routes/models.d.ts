/**
 * Model test endpoint — `POST /api/v1/models/test`.
 *
 * Given a model slot config (provider + endpoint + apiKey + model),
 * make ONE tiny upstream call and return ok/err. Used by the Settings
 * page's "测试" button for each of the three slots: **embedding**,
 * **summarizer** (maps to `llm`), and **skillEvolver**.
 *
 * The legacy plugin did the same thing (`POST /api/test-model`). We
 * mirror the behaviour byte-for-byte:
 *
 *   - Embedding slot → a single "test embedding vector" embed call.
 *     Success iff response has a non-empty numeric vector.
 *   - Chat slot (summarizer / skill evolver) → a single "hi" message
 *     with `max_tokens: 5` (or provider equivalent). Success iff the
 *     provider returns a non-error response.
 *
 * We deliberately DON'T use the user's saved config — the form may be
 * unsaved, and we don't want to accidentally persist a bad API key.
 * The test runs with values from the request body only.
 */
import { type Embedder } from "../../core/embedding/index.js";
import type { ServerDeps } from "../types.js";
import { type Routes } from "./registry.js";
export declare function registerModelsRoutes(routes: Routes, deps: ServerDeps): void;
type LocalProbeEmbedder = Pick<Embedder, "embedOne">;
type LocalProbeEmbedderFactory = (model: string) => LocalProbeEmbedder;
/**
 * Load the local model and execute a real embedding. The transformer pipeline
 * is process-global, so intentionally keep it warm after a successful probe.
 */
export declare function probeLocalEmbedding(model: string, create?: LocalProbeEmbedderFactory): Promise<number>;
export {};
//# sourceMappingURL=models.d.ts.map