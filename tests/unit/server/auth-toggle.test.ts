/**
 * Auth toggle (password-protection switch).
 *
 * The DSH settings page exposes a switch that turns memos viewer password
 * protection ON/OFF. Turning it OFF writes a `.auth-disabled` marker so
 * `requireSession` lets everyone through and `auth/status` reports the app
 * unlocked — WITHOUT deleting the existing password. Turning it back ON
 * removes the marker, so the old password still works (no re-setup).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { startHttpServer } from "../../../server/index.js";
import type { ServerHandle } from "../../../server/index.js";
import type { MemoryCore } from "../../../agent-contract/memory-core.js";

function stubCore(): MemoryCore {
  const noop = vi.fn(async () => ({}) as never);
  return new Proxy({} as MemoryCore, { get: () => noop });
}

describe("auth toggle (password-protection switch)", () => {
  let tmpRoots: string[] = [];
  let handles: ServerHandle[] = [];
  let home = "";
  let handle!: ServerHandle;

  beforeEach(async () => {
    tmpRoots = [];
    handles = [];
    home = mkdtempSync(join(tmpdir(), "memos-auth-toggle-"));
    tmpRoots.push(home);
    handle = await startHttpServer(
      { core: stubCore(), home: { root: home } },
      { port: 0, agent: "deepseek-harness" },
    );
    handles.push(handle);
  });

  afterEach(async () => {
    for (const h of handles) {
      try { await h.close(); } catch { /* ignore */ }
    }
    for (const r of tmpRoots) {
      try { rmSync(r, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  });

  async function setup(password: string): Promise<Response> {
    return fetch(`${handle.url}/api/v1/auth/setup`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
    });
  }

  async function status(): Promise<{ enabled: boolean; needsSetup: boolean; authenticated: boolean }> {
    const r = await fetch(`${handle.url}/api/v1/auth/status`);
    return (await r.json()) as {
      enabled: boolean;
      needsSetup: boolean;
      authenticated: boolean;
    };
  }

  const markerPath = () => join(home, ".auth-disabled");

  it("disable writes the marker, unlocks /api, keeps password", async () => {
    await setup("secret");
    expect(existsSync(markerPath())).toBe(false);

    // Before: /api blocked without a cookie.
    const blocked = await fetch(`${handle.url}/api/v1/ping`);
    expect(blocked.status).toBe(401);

    const disable = await fetch(`${handle.url}/api/v1/auth/disable`, { method: "POST" });
    expect(disable.status).toBe(200);
    expect(await disable.json()).toMatchObject({ ok: true, enabled: false });
    expect(existsSync(markerPath())).toBe(true);

    // After: /api now open (no cookie needed).
    const open = await fetch(`${handle.url}/api/v1/ping`);
    expect(open.status).toBe(200);

    const st = await status();
    expect(st).toMatchObject({ enabled: false, needsSetup: false, authenticated: true });
  });

  it("enable removes the marker and restores login requirement", async () => {
    await setup("secret");
    await fetch(`${handle.url}/api/v1/auth/disable`, { method: "POST" });
    expect(existsSync(markerPath())).toBe(true);

    const enable = await fetch(`${handle.url}/api/v1/auth/enable`, { method: "POST" });
    expect(enable.status).toBe(200);
    expect(await enable.json()).toMatchObject({ ok: true, enabled: true });
    expect(existsSync(markerPath())).toBe(false);

    // /api blocked again without a cookie.
    const blocked = await fetch(`${handle.url}/api/v1/ping`);
    expect(blocked.status).toBe(401);

    const st = await status();
    expect(st.enabled).toBe(true);
    // No cookie → still asks for login (needsSetup false because pw exists).
    expect(st.needsSetup).toBe(false);
    expect(st.authenticated).toBe(false);
  });

  it("enable with no password returns to first-run needsSetup", async () => {
    // No password configured at all.
    let st = await status();
    expect(st.needsSetup).toBe(true);
    await fetch(`${handle.url}/api/v1/auth/disable`, { method: "POST" });
    st = await status();
    expect(st.needsSetup).toBe(false);
    expect(st.authenticated).toBe(true);

    await fetch(`${handle.url}/api/v1/auth/enable`, { method: "POST" });
    st = await status();
    // No .auth.json and no marker → back to first-run setup.
    expect(st.needsSetup).toBe(true);
  });

  it("disable then enable: old password still works (no re-setup)", async () => {
    await setup("secret");
    await fetch(`${handle.url}/api/v1/auth/disable`, { method: "POST" });
    await fetch(`${handle.url}/api/v1/auth/enable`, { method: "POST" });

    const login = await fetch(`${handle.url}/api/v1/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: "secret" }),
    });
    expect(login.status).toBe(200);
  });
});