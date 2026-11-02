import type { MemoryImportBundle, MemoryImportOptions, MemoryImportResult } from "../../agent-contract/import.js";
import type { RuntimeNamespace } from "../../agent-contract/dto.js";
import type { Repos, StorageDb } from "../storage/index.js";
/** Import each row atomically; a rejected trace must not leave synthetic parents behind. */
export declare function importMemoryBundle(bundle: MemoryImportBundle, options: MemoryImportOptions, context: {
    db: StorageDb;
    repos: Repos;
    namespace: RuntimeNamespace;
}): Promise<MemoryImportResult>;
//# sourceMappingURL=bundle-import.d.ts.map