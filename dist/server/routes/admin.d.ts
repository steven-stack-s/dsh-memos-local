import type { ServerDeps, ServerOptions } from "../types.js";
import type { Routes } from "./registry.js";
export declare function registerAdminRoutes(routes: Routes, deps: ServerDeps, options?: ServerOptions): void;
/**
 * Detect the supervisors used by supported desktop/server installs.
 *
 * The MemOS launchd job exports its stable label through XPC_SERVICE_NAME.
 * Do not treat arbitrary GUI-app XPC labels as supervision: a portable
 * daemon launched from such an app would exit with nobody to replace it.
 * systemd services expose INVOCATION_ID for the invocation.
 */
export declare function isSupervisorManagedProcess(env?: NodeJS.ProcessEnv): boolean;
//# sourceMappingURL=admin.d.ts.map