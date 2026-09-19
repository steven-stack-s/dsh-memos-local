/**
 * Health + status endpoints.
 *
 * Kept boring on purpose — viewer polls these at 1–5s intervals, so
 * any allocation here compounds. The `health()` call on the core is
 * expected to be O(1) (cached).
 */
import type { ServerDeps, ServerOptions } from "../types.js";
import type { Routes } from "./registry.js";
export declare function registerHealthRoutes(routes: Routes, deps: ServerDeps, options?: ServerOptions): void;
//# sourceMappingURL=health.d.ts.map