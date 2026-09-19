/**
 * Mount the memos-local Memory Viewer onto the host DSH web server at the
 * `/memos` prefix, so the same external (HTTPS) entrance used for DSH also
 * reaches the loopback-only viewer — no extra port mapping, no Mixed-Content.
 *
 * Routing:  browser /memos/xxx  -> viewer /xxx ; /memos/api/v1/xxx -> /api/v1/xxx
 */
import { type IncomingMessage, type ServerResponse } from "node:http";
interface WebServerRegistration {
    kind: "prefix";
    path: string;
    handler: (req: IncomingMessage, res: ServerResponse) => void;
}
interface VueWebServerLike {
    register(opts: WebServerRegistration): () => void;
}
/** Register the `/memos` prefix onto a DSH webServer-compatible object. */
export declare function mountViewerProxy(webServer: VueWebServerLike, upstreamPort: number, log: (msg: string) => void): () => void;
export {};
//# sourceMappingURL=viewer-proxy.d.ts.map