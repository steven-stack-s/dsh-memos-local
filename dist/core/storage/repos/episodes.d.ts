import type { EpisodeId, EpisodeRow, SessionId } from "../../types.js";
import type { EpisodeListFilter, StorageDb } from "../types.js";
export interface EpisodeMetaRow {
    meta?: Record<string, unknown>;
}
export interface ClosedEpisodeCursor {
    startedAt: number;
    id: string;
}
export declare function makeEpisodesRepo(db: StorageDb): {
    insert(row: EpisodeRow & {
        meta?: Record<string, unknown>;
    }): void;
    upsert(row: EpisodeRow & {
        meta?: Record<string, unknown>;
    }): void;
    close(id: EpisodeId, endedAt: number, rTask?: number): void;
    /**
     * Flip a closed episode back to `status='open'` (V7 §0.1 revision
     * path). Surgical UPDATE on the status column only — must NEVER
     * be implemented via `upsert`, which is `INSERT OR REPLACE` and
     * would cascade-delete every trace for the episode.
     */
    reopen(id: EpisodeId): void;
    setRTask(id: EpisodeId, rTask: number): void;
    updateMeta(id: EpisodeId, metaPatch: Record<string, unknown>): void;
    appendTrace(id: EpisodeId, traceIds: string[]): void;
    removeTraceIds(id: EpisodeId, traceIds: readonly string[]): void;
    deleteById(id: EpisodeId): void;
    getById(id: EpisodeId): (EpisodeRow & EpisodeMetaRow) | null;
    getOpenForSession(sessionId: SessionId): (EpisodeRow & EpisodeMetaRow) | null;
    list(filter?: EpisodeListFilter): Array<EpisodeRow & EpisodeMetaRow>;
    /**
     * Return one stable, newest-first page of closed episodes. A cursor keeps
     * scans progressing when new rows are inserted ahead of an earlier page.
     */
    listClosedPage(opts?: {
        limit?: number;
        before?: ClosedEpisodeCursor | null;
    }): Array<EpisodeRow & EpisodeMetaRow>;
    count(filter?: Omit<EpisodeListFilter, "limit" | "offset">): number;
};
//# sourceMappingURL=episodes.d.ts.map