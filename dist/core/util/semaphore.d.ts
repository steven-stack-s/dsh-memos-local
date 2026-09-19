export interface Semaphore {
    acquire(signal?: AbortSignal): Promise<() => void>;
}
export declare function createSemaphore(max: number): Semaphore;
//# sourceMappingURL=semaphore.d.ts.map