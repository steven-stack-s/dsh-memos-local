import { describe, expect, it } from "vitest";

import {
  displayModelName,
  formatModelStatusLine,
  modelStatusFromInfo,
} from "../../../viewer/src/views/overview/model-status";

describe("overview model status", () => {
  it("renders a healthy model as Connected, not the status object", () => {
    const status = modelStatusFromInfo({
      available: true,
      provider: "openai_compatible",
      model: "gpt-4o-mini",
      lastOkAt: 1_700_000_000_000,
    });

    expect(status.label).toBe("Connected");
    expect(formatModelStatusLine(status.label)).toBe("Connected");
  });

  it("does not call a host-managed model 'unconfigured'", () => {
    // The DSH host bridge owns the model choice: `config.yaml` leaves
    // `llm.model` empty on purpose, so the card used to render "Not
    // configured" for a slot that is healthy and actively serving. The
    // empty name is expected here, not a misconfiguration.
    const info = {
      available: true,
      provider: "host",
      model: "",
      lastError: { at: 1_700_000_000_000, message: "some transient failure" },
    };

    expect(displayModelName(info)).not.toBe("Not configured");
    expect(displayModelName(info)).toContain("host");
  });

  it("still reports a genuinely unconfigured slot", () => {
    // A slot with no provider at all really is unconfigured — the host
    // exemption must not swallow this case.
    expect(displayModelName({ available: false, provider: "none", model: "" })).toBe(
      "Not configured",
    );
    expect(displayModelName(undefined)).toBe("Not configured");
  });

  it("prefers a configured model name over the host placeholder", () => {
    expect(
      displayModelName({ available: true, provider: "openai_compatible", model: "gpt-4o-mini" }),
    ).toBe("gpt-4o-mini");
  });

  it("surfaces the local embedding model, which is always named", () => {
    expect(
      displayModelName({
        available: true,
        provider: "local",
        model: "Xenova/all-MiniLM-L6-v2",
        dim: 384,
      }),
    ).toBe("Xenova/all-MiniLM-L6-v2");
  });

  it("never falls back to browser object stringification in the status line", () => {
    const status = modelStatusFromInfo({
      available: true,
      provider: { name: "openai_compatible" },
      model: "gpt-4o-mini",
      lastFallbackAt: 1_700_000_000_000,
      lastError: {
        at: 1_700_000_000_000,
        message: { code: "bad_model", reason: "missing" },
      },
    });
    const line = formatModelStatusLine(status.label, { inherited: true }, { name: "x" });

    expect(status.label).not.toContain("[object Object]");
    expect(line).not.toContain("[object Object]");
    expect(line).toContain("bad_model");
  });
});
