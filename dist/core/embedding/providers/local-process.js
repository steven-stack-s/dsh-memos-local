/** Windows DLL isolation. A thread would still share the host's native DLLs. */
import { fork } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { MemosError } from "../../../agent-contract/errors.js";
const IDLE_MS = 5 * 60_000;
class LocalEmbeddingProcess {
    child;
    pending = new Map();
    nextId = 0;
    idleTimer;
    lastLog;
    start() {
        if (this.child)
            return this.child;
        let entry = new URL("./local-process-entry.js", import.meta.url);
        let execArgv = [];
        if (!existsSync(entry)) {
            // Source checkouts use the declared tsx runtime; published packages use JS.
            entry = new URL("./local-process-entry.ts", import.meta.url);
            execArgv = [
                "--import",
                pathToFileURL(createRequire(import.meta.url).resolve("tsx")).href,
            ];
        }
        const env = {
            ...process.env,
            ELECTRON_RUN_AS_NODE: "1",
        };
        // Do not re-run a host's preloads or resolver hooks in the isolated process.
        delete env.NODE_OPTIONS;
        delete env.NODE_PATH;
        const options = {
            execArgv,
            env,
            windowsHide: true,
            stdio: ["ignore", "ignore", "ignore", "ipc"],
        };
        const child = fork(fileURLToPath(entry), [], options);
        this.child = child;
        child.on("message", (message) => this.receive(child, message));
        child.on("error", () => this.fail(child, "Local embedding process failed to start or communicate."));
        child.on("exit", () => this.fail(child, "Local embedding process exited; the next request will restart it."));
        return child;
    }
    fail(child, message) {
        if (this.child !== child)
            return;
        this.child = undefined;
        clearTimeout(this.idleTimer);
        for (const call of this.pending.values()) {
            call.cleanup();
            call.reject(new MemosError("embedding_unavailable", message));
        }
        this.pending.clear();
        child.kill();
    }
    send(child, message) {
        try {
            child.send(message, (error) => {
                if (error)
                    this.fail(child, "Local embedding process IPC failed.");
            });
        }
        catch {
            this.fail(child, "Local embedding process IPC failed.");
        }
    }
    receive(child, message) {
        if (this.child !== child || !message || typeof message !== "object")
            return;
        const call = this.pending.get(message.id);
        if (message.type === "log") {
            const log = call?.ctx.log ?? this.lastLog;
            if (["trace", "debug", "info", "warn", "error"].includes(message.level))
                log?.[message.level](message.message, message.data);
            return;
        }
        if (!call || !["result", "error"].includes(message.type))
            return;
        this.pending.delete(message.id);
        call.cleanup();
        if (message.type === "error") {
            call.reject(new MemosError("embedding_unavailable", message.message));
        }
        else if (message.type === "result") {
            const vectors = message.vectors;
            if (!Array.isArray(vectors) ||
                vectors.length !== call.count ||
                vectors.some((vector) => !Array.isArray(vector) ||
                    !vector.length ||
                    vector.some((n) => typeof n !== "number" || !Number.isFinite(n)))) {
                call.reject(new MemosError("embedding_unavailable", "Local embedding process returned invalid vectors."));
            }
            else
                call.resolve(vectors);
        }
        this.updateLiveness();
    }
    updateLiveness() {
        clearTimeout(this.idleTimer);
        if (this.pending.size) {
            this.child?.ref();
            this.child?.channel?.ref();
        }
        else {
            // Keep a warm model without preventing the host from exiting. Idle cleanup
            // also bounds resources used by throwaway Settings model probes.
            this.child?.unref();
            this.child?.channel?.unref();
            this.idleTimer = setTimeout(() => this.close(), IDLE_MS);
            this.idleTimer.unref();
        }
    }
    embed(texts, ctx) {
        if (ctx.signal?.aborted)
            return Promise.reject(ctx.signal.reason);
        let child;
        try {
            child = this.start();
        }
        catch {
            return Promise.reject(new MemosError("embedding_unavailable", "Cannot start the isolated local embedding process."));
        }
        const id = ++this.nextId;
        this.lastLog = ctx.log;
        ctx.log.debug("process.request", { pid: child.pid, requestId: id });
        return new Promise((resolve, reject) => {
            const onAbort = () => {
                if (!this.pending.delete(id))
                    return;
                ctx.signal?.removeEventListener("abort", onAbort);
                reject(ctx.signal?.reason ?? new DOMException("Aborted", "AbortError"));
                this.send(child, { type: "cancel", id });
                this.updateLiveness();
            };
            this.pending.set(id, {
                resolve,
                reject,
                ctx,
                count: texts.length,
                cleanup: () => ctx.signal?.removeEventListener("abort", onAbort),
            });
            ctx.signal?.addEventListener("abort", onAbort, { once: true });
            this.updateLiveness();
            this.send(child, {
                type: "embed",
                id,
                texts,
                model: ctx.config.model,
                local: ctx.config.local,
            });
        });
    }
    close() {
        if (this.child)
            this.fail(this.child, "Local embedding process closed.");
        clearTimeout(this.idleTimer);
        this.lastLog = undefined;
    }
}
// Share a warm process across cores and Settings probes; closing one provider
// must not interrupt another provider's pending inference.
let shared;
export function acquireLocalEmbeddingProcess() {
    shared ??= { client: new LocalEmbeddingProcess(), users: 0 };
    shared.users++;
    return shared.client;
}
export function releaseLocalEmbeddingProcess(client) {
    if (!shared || shared.client !== client)
        return;
    if (--shared.users === 0) {
        shared = undefined;
        client.close();
    }
}
//# sourceMappingURL=local-process.js.map