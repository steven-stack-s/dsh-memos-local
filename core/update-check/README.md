# `core/update-check/`

> Periodic check for newer plugin versions on npm. Surfaces a notice in
> the viewer's **Overview**; never auto-updates.

> **Status: implementation removed.** Only this README remains; the check
> itself was dropped when the non-DSH adapters were pruned. The viewer still
> renders `system.update_available` events (`viewer/src/views/overview/`), so
> re-adding the implementation is a matter of emitting that event.

## ⚠️ Must be reworked before it is re-added

The behaviour below is written for the **old version policy**, where the local
version tracked upstream `@memtensor/memos-local-plugin` exactly. Under the
current policy the running version is `<upstream>-dsh.<n>` (e.g.
`2.0.19-dsh.1`), and this comparison would be wrong:

1. **It compares against the wrong package.** The plugin now publishes as
   `@steven-stack-s/dsh-memos-local`, not `@memtensor/memos-local-plugin`.
   Checking upstream would report an update that does not exist for this fork.
2. **It would misread our own local revisions.** `semver` treats
   `2.0.19-dsh.1` as *less than* `2.0.19` (prerelease sorts below its release),
   so a naive "is latest newer than running?" check against upstream would
   always look wrong. Compare against our own package's `latest` dist-tag, and
   be aware that `latest` always points at the newest published version, so it
   is a valid target for this comparison.

Fix both before shipping: fetch our own package's `latest`, and compare the
full version string including the `-dsh.N` segment.

## Behaviour (as originally designed)

1. At plugin boot, schedule a background check 30 s after startup.
2. Fetch `https://registry.npmjs.org/@memtensor/memos-local-plugin` with
   a 10 s timeout and no auth.
3. Compare `latest` dist-tag to the running `package.json` version.
4. When a newer version is available, emit an `update.available` event
   and write a one-line note to `logs/app.log`. The viewer's overview
   endpoint reads this note and renders a banner.
5. Re-check every 24 h while the plugin is alive.

## Disablement

- `updateCheck.enabled: false` in `config.yaml` turns the whole loop off.
- If the registry fetch fails, we log at `debug` and retry on the next
  24 h tick — never at a shorter interval (avoid hammering npm).

## Tests

- `tests/unit/update-check/` — timer wiring + version-compare logic.
- The fetch function is injected so tests can stub the registry response.
