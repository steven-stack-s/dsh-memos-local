#!/usr/bin/env node
/*
 * DSH fork of @memtensor/memos-local-plugin.
 * postinstall hook — intentionally tiny and side-effect free.
 * DeepSeek Harness manages the plugin via `dsh plugin` / plugin_manager,
 * so no agent-specific installer is invoked here.
 */

"use strict";

// Skip local dev installs and non-forced scenarios (same as upstream).
if (process.env.npm_config_global !== "true" && process.env.MEMOS_FORCE_POSTINSTALL !== "1") {
  process.exit(0);
}

const banner = [
  "",
  "  @steven-stack-s/dsh-memos-local installed.",
  "",
  "  Source code is here, but no DeepSeek Harness profile has been wired up.",
  "  Install / enable it in your DSH profile with:",
  "",
  "      dsh plugin --profile web add @steven-stack-s/dsh-memos-local",
  "",
  "  Then enable the bundle row 'memos-local-memory' (or via plugin_manager).",
  "",
].join("\n");

process.stdout.write(banner);
