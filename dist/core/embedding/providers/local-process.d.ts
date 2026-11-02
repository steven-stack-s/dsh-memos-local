import type { ProviderCallCtx } from "../types.js";
declare class LocalEmbeddingProcess {
    private child?;
    private pending;
    private nextId;
    private idleTimer?;
    private lastLog?;
    private start;
    private fail;
    private send;
    private receive;
    private updateLiveness;
    embed(texts: string[], ctx: ProviderCallCtx): Promise<number[][]>;
    close(): void;
}
export declare function acquireLocalEmbeddingProcess(): LocalEmbeddingProcess;
export declare function releaseLocalEmbeddingProcess(client: LocalEmbeddingProcess): void;
export {};
//# sourceMappingURL=local-process.d.ts.map