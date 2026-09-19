/// <reference lib="dom" />
/**
 * Hash-based router backed by Preact signals.
 *
 * The viewer is a single-page app served from the plugin's HTTP
 * server under `/ui/`. Using the URL hash keeps the router framework-
 * free and side-steps history pushState, which would require server
 * fallbacks for every route.
 */

import { signal } from "@preact/signals";

export type Route = {
  path: string;
  params: Record<string, string>;
};

function parseHash(): Route {
  const raw = window.location.hash.replace(/^#/, "");
  if (!raw) return { path: "/overview", params: {} };
  const [path, query = ""] = raw.split("?");
  const params: Record<string, string> = {};
  if (query) {
    for (const pair of query.split("&")) {
      const [k, v = ""] = pair.split("=");
      if (!k) continue;
      params[decodeURIComponent(k)] = decodeURIComponent(v);
    }
  }
  return { path: path || "/overview", params };
}

export const route = signal<Route>(parseHash());

window.addEventListener("hashchange", () => {
  route.value = parseHash();
});

export function navigate(path: string, params?: Record<string, string>): void {
  let hash = `#${path}`;
  if (params && Object.keys(params).length > 0) {
    const q = Object.entries(params)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join("&");
    hash += `?${q}`;
  }
  window.location.hash = hash;
}

/**
 * Embedded mode — set by the DSH Settings shell when it hosts a viewer
 * page inside an iframe (e.g. `/memos/?lang=zh&embed=1#/settings`).
 *
 * In this mode the app renders only the routed view: the topbar, model
 * banner and sidebar (which belong to the standalone viewer) are
 * omitted, so the page looks like native DSH settings content instead
 * of a whole viewer nested inside another shell.
 *
 * Read once at module load — the DSH shell never flips this at runtime;
 * it sets the parameter when it creates the iframe.
 */
export const embedded: boolean = (() => {
  try {
    const q = new URLSearchParams(window.location.search);
    const v = q.get("embed");
    return v === "1" || v === "true";
  } catch {
    return false;
  }
})();
