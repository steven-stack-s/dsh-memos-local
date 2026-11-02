/** Child-only entry point. Never import this module from a host adapter. */
import { InProcessLocalEmbeddingProvider } from "./local.js";
const provider = new InProcessLocalEmbeddingProvider();
const controllers = new Map();
function send(message) {
    if (!process.connected)
        return;
    try {
        process.send?.(message, () => { });
    }
    catch {
        /* Parent disconnected. */
    }
}
async function handle(message) {
    if (message.type === "cancel") {
        controllers.get(message.id)?.abort();
        return;
    }
    const controller = new AbortController();
    controllers.set(message.id, controller);
    const log = Object.fromEntries(["trace", "debug", "info", "warn", "error"].map((level) => [
        level,
        (text, data) => send({
            type: "log",
            id: message.id,
            level: level,
            message: text,
            data,
        }),
    ]));
    try {
        const vectors = await provider.embed(message.texts, "query", {
            config: {
                provider: "local",
                model: message.model,
                local: message.local,
                dimensions: 384,
                openRouter: false,
                cache: { enabled: false, maxItems: 0 },
            },
            log,
            signal: controller.signal,
        });
        send({ type: "result", id: message.id, vectors });
    }
    catch (error) {
        send({
            type: "error",
            id: message.id,
            message: error instanceof Error
                ? error.message
                : "Local model loading or inference failed.",
        });
    }
    finally {
        controllers.delete(message.id);
    }
}
process.on("message", (message) => {
    void handle(message);
});
// No orphan model process after a host crash, restart or normal exit.
process.on("disconnect", () => process.exit(0));
//# sourceMappingURL=local-process-entry.js.map