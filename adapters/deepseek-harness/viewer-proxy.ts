/**
 * Mount the memos-local Memory Viewer onto the host DSH web server at the
 * `/memos` prefix, so the same external (HTTPS) entrance used for DSH also
 * reaches the loopback-only viewer — no extra port mapping, no Mixed-Content.
 *
 * Routing:  browser /memos/xxx  -> viewer /xxx ; /memos/api/v1/xxx -> /api/v1/xxx
 */
import { request, type IncomingMessage, type ServerResponse, type ClientRequest } from "node:http";

const PREFIX = "/memos";

const INJECT = `
<base href="${PREFIX}/">
<script>
(function () {
  var P = ${JSON.stringify(PREFIX)};
  function fix(u) {
    if (typeof u !== "string") return u;
    return u.indexOf("/api/") === 0 ? P + u : u;
  }
  var _fetch = window.fetch;
  if (_fetch) {
    window.fetch = function (input, init) {
      if (typeof input === "string") return _fetch.call(this, fix(input), init);
      if (input && typeof input.url === "string" && input.url.indexOf("/api/") === 0) {
        return _fetch.call(this, new Request(P + input.url, input), init);
      }
      return _fetch.call(this, input, init);
    };
  }
  var _open = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (m, u) {
    var args = Array.prototype.slice.call(arguments);
    args[1] = fix(u);
    return _open.apply(this, args);
  };
  if (window.EventSource) {
    var _ES = window.EventSource;
    var ES = function (u, o) { return new _ES(fix(u), o); };
    ES.prototype = _ES.prototype;
    window.EventSource = ES;
  }
})();
</script>
`;

interface WebServerRegistration {
  kind: "prefix";
  path: string;
  handler: (req: IncomingMessage, res: ServerResponse) => void;
}

interface VueWebServerLike {
  register(opts: WebServerRegistration): () => void;
}

function proxy(
  req: IncomingMessage,
  res: ServerResponse,
  upstreamPort: number,
): void {
  const url = req.url || "/";
  const qi = url.indexOf("?");
  const query = qi >= 0 ? url.slice(qi) : "";
  let rest = qi >= 0 ? url.slice(0, qi) : url;
  if (rest.startsWith(PREFIX)) rest = rest.slice(PREFIX.length);
  if (!rest.startsWith("/")) rest = "/" + rest;

  const headers: Record<string, string | string[] | undefined> = { ...req.headers };
  headers.host = `127.0.0.1:${upstreamPort}`;
  headers["accept-encoding"] = "identity";

  const up: ClientRequest = request(
    {
      host: "127.0.0.1",
      port: upstreamPort,
      method: req.method,
      path: rest + query,
      headers,
    },
    (upRes: IncomingMessage) => {
      const ct = String(upRes.headers["content-type"] ?? "");
      const isHtml = /html/i.test(ct);
      const outHeaders: Record<string, string | string[] | undefined> = {
        ...(upRes.headers as Record<string, string | string[] | undefined>),
      };
      delete outHeaders["content-length"];
      delete outHeaders["content-encoding"];

      if (isHtml) {
        const chunks: Buffer[] = [];
        upRes.on("data", (data: Buffer) => chunks.push(Buffer.from(data)));
        upRes.on("end", () => {
          let html = Buffer.concat(chunks).toString("utf8");
          if (html.includes("<head>")) html = html.replace("<head>", "<head>" + INJECT);
          else html = INJECT + html;
          const buf = Buffer.from(html, "utf8");
          outHeaders["content-length"] = String(buf.length);
          res.writeHead(upRes.statusCode ?? 200, outHeaders);
          res.end(buf);
        });
        upRes.on("error", () => res.destroy());
        return;
      }

      res.writeHead(upRes.statusCode ?? 200, outHeaders);
      upRes.pipe(res);
    },
  );

  up.on("error", (err: Error) => {
    res.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
    res.end(`memos-viewer: upstream 127.0.0.1:${upstreamPort} unreachable: ${err.message}`);
  });

  req.pipe(up);
}

/** Register the `/memos` prefix onto a DSH webServer-compatible object. */
export function mountViewerProxy(
  webServer: VueWebServerLike,
  upstreamPort: number,
  log: (msg: string) => void,
): () => void {
  const dispose = webServer.register({
    kind: "prefix",
    path: PREFIX,
    handler: (req, res) => proxy(req, res, upstreamPort),
  });
  log(`memos-local-memory: mounted ${PREFIX}/ -> 127.0.0.1:${upstreamPort}`);
  return () => dispose();
}
