import { describe, expect, it } from "vitest";

import { DEFAULT_CONFIG, resolveConfig } from "../../../core/config/index.js";
import { FREE_FORM_CONFIG_PATHS } from "../../../core/config/defaults.js";

describe("resolveConfig llm.maxTokens + llm.headers", () => {
  it("uses an explicit allowlist for free-form config maps", () => {
    expect(FREE_FORM_CONFIG_PATHS).toEqual([
      "llm.headers",
      "l3Llm.headers",
      "skillEvolver.headers",
      "logging.channels",
    ]);
    expect(Object.isFrozen(FREE_FORM_CONFIG_PATHS)).toBe(true);

    const warnings: string[] = [];
    const cfg = resolveConfig(
      {
        logging: { channels: { "core.l2.cross-task": "debug" } },
      },
      warnings,
    );
    expect(cfg.logging.channels).toEqual({ "core.l2.cross-task": "debug" });
    expect(warnings).toEqual([]);
  });

  it("accepts llm.maxTokens and llm.headers without unknown-key warnings", () => {
    const warnings: string[] = [];
    const cfg = resolveConfig(
      {
        llm: {
          maxTokens: 2048,
          headers: { "User-Agent": "hermes-test", "X-Custom": "v1" },
        },
      },
      warnings,
    );
    expect(cfg.llm.maxTokens).toBe(2048);
    expect(cfg.llm.headers).toEqual({ "User-Agent": "hermes-test", "X-Custom": "v1" });
    // The free-form-map special case must not warn per header key.
    expect(warnings).toEqual([]);
  });

  it("declares llm.maxTokens with a default of 8192", () => {
    // Raised from 1024: the summary slot also serves the structured-JSON
    // calls (reflection / scoring / L3 abstraction), and a reasoning model
    // spends output tokens before it emits any JSON. At 1024 the budget was
    // frequently exhausted mid-object, which surfaced as
    // \`llm_output_malformed: ... reached the token cap before completing\`
    // and painted the Overview model card red even though the call had a
    // working fallback.
    //
    // The number is now data-backed rather than a guess. Replaying the real
    // L3 abstraction prompt against the host LLM with six live policies
    // produced 11 331 output characters in **2 707 completion tokens**
    // (11.8 s, valid JSON) — above the old 2048, which is why the
    // 1024 → 2048 raise did not stop the errors. Stored world models reach
    // ~24 900 characters, so 8192 leaves headroom for the largest clusters.
    //
    // A ceiling, not a target: short calls stop when they finish.
    expect(DEFAULT_CONFIG.llm.maxTokens).toBe(8192);
    const cfg = resolveConfig({});
    expect(cfg.llm.maxTokens).toBe(8192);
  });

  it("declares llm.headers defaulting to an empty map", () => {
    expect(DEFAULT_CONFIG.llm.headers).toEqual({});
    const cfg = resolveConfig({});
    expect(cfg.llm.headers).toEqual({});
  });

  it("declares skillEvolver.maxTokens (default 4096) for the crystallizer LLM slot", () => {
    expect(DEFAULT_CONFIG.skillEvolver.maxTokens).toBe(4096);
    const cfg = resolveConfig({ skillEvolver: { maxTokens: 8192 } });
    expect(cfg.skillEvolver.maxTokens).toBe(8192);
  });

  it("declares l3Llm.maxTokens (default 4096) sharing the SkillEvolver schema", () => {
    expect(DEFAULT_CONFIG.l3Llm.maxTokens).toBe(4096);
    const cfg = resolveConfig({ l3Llm: { maxTokens: 8192 } });
    expect(cfg.l3Llm.maxTokens).toBe(8192);
  });

  it("accepts headers on skillEvolver/l3Llm slots without unknown-key warnings", () => {
    const warnings: string[] = [];
    const cfg = resolveConfig(
      {
        skillEvolver: { headers: { "X-Evolver": "v1" } },
        l3Llm: { headers: { "X-L3": "v2" } },
      },
      warnings,
    );
    expect(cfg.skillEvolver.headers).toEqual({ "X-Evolver": "v1" });
    expect(cfg.l3Llm.headers).toEqual({ "X-L3": "v2" });
    expect(cfg.l3Llm.maxTokens).toBe(4096);
    expect(warnings).toEqual([]);
  });

  it("declares headers defaulting to empty on the dedicated slots", () => {
    expect(DEFAULT_CONFIG.skillEvolver.headers).toEqual({});
    expect(DEFAULT_CONFIG.l3Llm.headers).toEqual({});
  });

  it("rejects out-of-range maxTokens with config_invalid", () => {
    expect(() => resolveConfig({ llm: { maxTokens: 50 } })).toThrow(/config failed schema validation/);
  });

  it("rejects non-string header values", () => {
    expect(() => resolveConfig({ llm: { headers: { "X-Bad": 42 } } })).toThrow(
      /config failed schema validation/,
    );
  });

  it("keeps unrelated llm fields untouched when maxTokens/headers are set", () => {
    const cfg = resolveConfig({
      llm: { provider: "openai_compatible", model: "deepseek-v4-flash", maxTokens: 2048 },
    });
    expect(cfg.llm.provider).toBe("openai_compatible");
    expect(cfg.llm.model).toBe("deepseek-v4-flash");
    expect(cfg.llm.temperature).toBe(0);
    expect(cfg.llm.fallbackToHost).toBe(true);
    expect(cfg.llm.timeoutMs).toBe(45_000);
    expect(cfg.llm.maxRetries).toBe(3);
  });
});
