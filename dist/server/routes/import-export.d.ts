import type { ServerOptions } from "../types.js";
import type { ServerDeps } from "../types.js";
import { type Routes } from "./registry.js";
export declare function registerImportExportRoutes(routes: Routes, deps: ServerDeps, options?: ServerOptions): void;
interface HermesNativeMemoryPathOptions {
    env?: NodeJS.ProcessEnv;
    platform?: NodeJS.Platform;
    userHome?: string;
}
/** Resolve the host Hermes memory file, not the separate MemOS runtime home. */
export declare function resolveHermesNativeMemoryPath(options?: HermesNativeMemoryPathOptions): string;
export {};
//# sourceMappingURL=import-export.d.ts.map