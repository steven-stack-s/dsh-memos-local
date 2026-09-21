# templates/

Files here are copied into the user's runtime home (`~/.<agent>/memos-plugin/`)
by an installer. They are **not** read by the running plugin — the plugin always
reads the actual user files at runtime.

| File                | Copied to                              | Overwritten on re-install? |
|---------------------|----------------------------------------|----------------------------|
| `README.user.md`    | `~/.<agent>/memos-plugin/README.md`    | Yes (it's just docs)       |

## Upstream templates are not in this fork

Upstream MemOS ships per-agent config templates —
`config.openclaw.yaml`, `config.hermes.yaml`, and a manual `config.demo.yaml`
overlay — consumed by its `install.sh` / `install.ps1`. **None of those files,
and neither installer, exist here.** With a single DeepSeek Harness adapter
there is no per-agent config template to ship, and installation runs through
`dsh plugin` (see `adapters/deepseek-harness/README.md`).

Consequently the runtime `config.yaml` is produced by the config writer rather
than copied from a template. The source of truth for every field, its default,
and its validation stays `core/config/schema.ts`.

Editing rules for anything added here later:

- Config templates must include **every** field with a sensible default and a
  short comment. Sensitive fields (API keys, tokens) MUST be present (empty
  string is fine) so users can fill them in by hand without guessing names.
- Any such template is a second source of truth alongside
  `core/config/schema.ts`. If you add a field, add it in both.
- The runtime config writer (`core/config/writer.ts`) preserves user comments
  and field order, so user customizations survive future template updates.
