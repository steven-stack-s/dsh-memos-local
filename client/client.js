// Memory client bundle for DeepSeek Harness (DSH) — memos-local.
//
// Hand-written per DSH's cordis-plugin-development convention:
//   window.__ModuleLoader__.load({ id, factory }) registers a lazy browser
//   module. The bundle contributes three DSH UI surfaces:
//     1. a full "Memory" panel in the main content area (main, key 'memos');
//     2. a "Memory" entry in the left nav panel list (sidebar.panellist);
//     3. a "Memory (Memos)" section in DSH Settings (settings.section).
//
// Panel content embeds the memos-local viewer (served on 127.0.0.1:18801)
// in an iframe. The panel follows the DSH web GUI language: the iframe src
// carries a ?lang= query param on load, and a postMessage handshake pushes
// subsequent DSH locale switches into the embedded viewer without a reload.
window.__ModuleLoader__.load({
  id: 'dsh-memos-local',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    const NODE = 'memos';
    const VIEWER_ALONE = '/memos'; // same-origin viewer mount via DSH web server

    // Bilingual copy used by the DSH-shell surfaces (nav + settings). The
    // embedded viewer carries its own full dictionary in the viewer bundle.
    const zh = {
      nav: '记忆',
      settings: '记忆 (MemOS)',
      panelTitle: '记忆',
      versionLabel: '版本',
      title: '记忆（MemOS）',
      healthOk: '模型就绪',
      healthDegraded: '有模型不可用',
      healthUnknown: '状态未知',
      open: '打开记忆查看器',
      authOn: '密码保护已开启',
      authOff: '密码保护已关闭',
      authLabel: '认证',
      authSwitchOn: '关闭',
      authSwitchOff: '开启',
      authBusy: '处理中…',
      authErr: '操作失败，请稍后重试',
      tabImport: '导入 / 导出',
      tabSettings: '设置',
      tabHelp: '帮助',
    };
    const en = {
      nav: 'Memory',
      settings: 'Memory (MemOS)',
      panelTitle: 'Memory',
      versionLabel: 'Version',
      title: 'Memory (MemOS)',
      healthOk: 'Models ready',
      healthDegraded: 'A model is unavailable',
      healthUnknown: 'Status unknown',
      open: 'Open Memory Viewer',
      authOn: 'Password protection enabled',
      authOff: 'Password protection disabled',
      authLabel: 'Authentication',
      authSwitchOn: 'Disable',
      authSwitchOff: 'Enable',
      authBusy: 'Processing…',
      authErr: 'Operation failed, please retry',
      tabImport: 'Import / Export',
      tabSettings: 'Settings',
      tabHelp: 'Help',
    };

    // --- Left nav icon (sidebar.panellist) ---
    function MemoryNavIcon() {
      return h('svg', {
        viewBox: '0 0 24 24', width: 18, height: 18, fill: 'none',
        stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round',
        strokeLinejoin: 'round', 'aria-hidden': true,
      },
        h('rect', { x: 5, y: 4, width: 12, height: 16, rx: 2 }),
        h('path', { d: 'M9 4v16M15 4v16M5 9h4M5 15h4' }),
      );
    }

    // --- Main panel content (main, key 'memos') ---
    // Embeds the dedicated memory viewer. The iframe src includes a ?lang=
    // param (current DSH locale) and postMessage pushes later locale changes.
    function MemoryPanel() {
      const ctx = applyCtx;
      const [lang, setLang] = React.useState(getActiveLang());
      React.useEffect(() => {
        if (!ctx || !ctx.locale || typeof ctx.locale.subscribe !== 'function') return;
        const unsubscribe = ctx.locale.subscribe(() => {
          setLang(getActiveLang());
        });
        return () => unsubscribe();
      }, []);
      React.useEffect(() => {
        const frame = frameRef.current;
        if (frame && frame.contentWindow) {
          frame.contentWindow.postMessage({ type: 'memos:set-locale', locale: lang }, '*');
        }
      }, [lang]);
      const t = lang === 'zh' ? zh : en;
      return h('iframe', {
        ref: frameRef,
        src: lang === 'zh' ? '/memos/?lang=zh' : '/memos/?lang=en',
        title: t.panelTitle,
        style: { width: '100%', height: '100%', border: '0', background: '#fff', display: 'block' },
        sandbox: 'allow-same-origin allow-scripts allow-forms allow-popups',
      });
    }

    // --- Settings section (settings.section) ---
    function MemorySettingsSection() {
      const ctx = applyCtx;
      const [lang, setLang] = React.useState(getActiveLang());
      const [state, setState] = React.useState('checking');
      const [version, setVersion] = React.useState(null);
      const [modelOk, setModelOk] = React.useState(null); // null=unknown
      // null means the auth status has not been read yet.
      const [authEnabled, setAuthEnabled] = React.useState(null);
      const [authBusy, setAuthBusy] = React.useState(false);
      const [authErr, setAuthErr] = React.useState(false);
      // Sub-tab selector: the general card plus three embedded viewer pages.
      const [tab, setTab] = React.useState('settings');
      React.useEffect(() => {
        if (!ctx || !ctx.locale || typeof ctx.locale.subscribe !== 'function') return;
        const unsubscribe = ctx.locale.subscribe(() => setLang(getActiveLang()));
        return () => unsubscribe();
      }, []);
      const refresh = () => {
        fetch('/memos/api/v1/auth/status', { signal: AbortSignal.timeout(2500) })
          .then((res) => {
            if (res.ok) { setState('online'); return res.json(); }
            setState('offline'); return null;
          })
          .then((body) => {
            if (body && typeof body.enabled === 'boolean') setAuthEnabled(body.enabled);
          })
          .catch(() => { setState('offline'); setAuthEnabled(null); });
        // Plugin version, shown ahead of the viewer status line. The health
        // endpoint reports the core's pkgVersion (falls back to "dev").
        fetch('/memos/api/v1/health', { signal: AbortSignal.timeout(2500) })
          .then((res) => (res.ok ? res.json() : null))
          .then((body) => {
            if (!body) return;
            if (typeof body.version === 'string' && body.version) {
              setVersion(body.version);
            }
            if (body.llm && body.embedder) {
              setModelOk(!!body.llm.available && !!body.embedder.available);
            }
          })
          .catch(() => {});
      };
      React.useEffect(() => { refresh(); }, []);
      const t = lang === 'zh' ? zh : en;
      const langQuery = lang === 'zh' ? '?lang=zh' : '?lang=en';
      // Version pill sits BEFORE the status text, per the DSH settings layout.
      const versionText = version ? ('v' + version) : '';
      const toggle = h('button', {
        onClick: async () => {
          if (authBusy || authEnabled === null) return;
          setAuthBusy(true); setAuthErr(false);
          const target = authEnabled ? 'disable' : 'enable';
          try {
            const res = await fetch('/memos/api/v1/auth/' + target, { method: 'POST' });
            if (!res.ok) { setAuthErr(true); return; }
            const body = await res.json().catch(() => ({}));
            if (typeof body.enabled === 'boolean') setAuthEnabled(body.enabled);
            else setAuthEnabled(!authEnabled);
          } catch {
            setAuthErr(true);
          } finally {
            setAuthBusy(false);
          }
        },
        disabled: authBusy || authEnabled === null,
        style: {
          margin: 0, padding: '3px 10px', borderRadius: 6, cursor: 'pointer',
          fontSize: '0.9em', fontWeight: 600, border: '1px solid transparent', lineHeight: 1.6,
          background: authEnabled
            ? 'var(--dsw-alias-state-error-primary, #e5484d)'
            : 'var(--dsw-alias-state-success-primary, #2f8f4e)',
          color: '#fff', opacity: authBusy || authEnabled === null ? 0.6 : 1,
        },
      }, authBusy ? t.authBusy : (authEnabled ? t.authSwitchOn : t.authSwitchOff));
      // Same size/weight as the tab labels so the card reads as one block.
      const authInfo = h('div', { style: { display: 'flex', flexDirection: 'column', gap: 2 } },
        h('span', { style: { fontSize: '1em', fontWeight: 500, lineHeight: 1.5 } },
          t.authLabel + ': ' + (authEnabled === null ? '\u2026' : (authEnabled ? t.authOn : t.authOff))),
        authErr ? h('span', { style: { color: 'var(--dsw-alias-state-error-primary, #e5484d)', fontSize: '0.85em', opacity: 0.9 } }, t.authErr) : null,
      );
      const rowStyle = {
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 12, padding: 0,
      };
      const tabs = [
        { id: 'settings', label: t.tabSettings },
        { id: 'import', label: t.tabImport },
        { id: 'help', label: t.tabHelp },
      ];
      // Tab strip mirrored from DSH's own settings tabs (underline indicator
      // + label tokens) so the embedded card matches the host shell instead
      // of carrying its own purple accent.
      const tabBar = h('div', {
        style: {
          display: 'flex', alignItems: 'flex-end', gap: 22,
          borderBottom: '0.5px solid var(--dsw-alias-border-l2, rgba(128,128,128,.28))',

        },
      }, tabs.map((item) => {
        const active = tab === item.id;
        return h('button', {
          key: item.id,
          type: 'button',
          'data-active': active ? 'true' : 'false',
          onClick: () => setTab(item.id),
          style: {
            position: 'relative', margin: 0, padding: '7px 1px 9px',
            background: 'none', border: 0, cursor: 'pointer', font: 'inherit',
            fontSize: '1em', lineHeight: '20px',
            color: active
              ? 'var(--dsw-alias-label-primary, inherit)'
              : 'var(--dsw-alias-label-tertiary, rgba(128,128,128,.9))',
          },
        },
          item.label,
          active ? h('span', {
            key: 'underline',
            style: {
              position: 'absolute', left: 0, right: 0, bottom: -1, height: 2,
              borderRadius: '2px 2px 0 0',
              background: 'var(--dsw-alias-label-primary, currentColor)',
            },
          }) : null,
        );
      }));
      // Same-origin iframe (through the DSH /memos proxy) so the embedded
      // pages keep their own locale + auth handling and full functionality.
      const frame = (hash, title) => h('iframe', {
        key: tab + hash,
        src: '/memos/' + langQuery + '&embed=1#' + hash,
        title,
        style: {
          width: '100%', height: '68vh', minHeight: 420,
          border: '1px solid rgba(128,128,128,.28)', borderRadius: 8, background: '#fff',
        },
        sandbox: 'allow-same-origin allow-scripts allow-forms allow-popups',
      });
      // Health dot: green only when both the LLM and the embedder report
      // available. Mirrors the viewer sidebar indicator.
      // Health dot: green when every model is available, orange when one is
      // down, grey until the first probe resolves.
      const healthColor =
        modelOk === null ? 'rgba(128,128,128,.65)' :
        modelOk
          ? 'var(--dsw-alias-state-success-primary, #2f8f4e)'
          : 'var(--dsw-alias-state-warn-primary, #e0a030)';
      const healthLabel =
        modelOk === null ? t.healthUnknown :
        modelOk ? t.healthOk : t.healthDegraded;
      const header = h('div', { style: { padding: 0 } },
        // Title row: name on the left, health dot + version trailing it as
        // small print. Everything inherits the host font size so the card
        // tracks the DSH appearance settings.
        h('div', {
          style: {
            display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
          },
        },
          h('span', { style: { fontSize: '1.06em', fontWeight: 600 } }, t.title),
          h('span', {
            style: {
              display: 'inline-flex', alignItems: 'center', gap: 6,
              fontSize: '0.85em', opacity: 0.7,
            },
          },
            h('span', {
              key: 'health',
              title: healthLabel,
              'aria-label': healthLabel,
              style: {
                width: 7, height: 7, borderRadius: 999, flexShrink: 0,
                background: healthColor,
                boxShadow: '0 0 0 2px color-mix(in srgb, ' + healthColor + ' 22%, transparent)',
              },
            }),
            h('span', { key: 'version' }, versionText),
          ),
        ),
        // Auth row.
        h('div', { style: rowStyle }, authInfo, toggle),
      );
      const body =
        tab === 'import' ? frame('/import', t.tabImport) :
        tab === 'help' ? frame('/help', t.tabHelp) :
        frame('/settings', t.tabSettings);
      return h('div', {
        style: {
          display: 'flex', flexDirection: 'column', gap: 10,
          padding: 0, fontSize: 'inherit', lineHeight: 'inherit',
        },
      },
        header,
        tabBar,
        body,
        h('a', {
          href: '/memos/', target: '_blank', rel: 'noreferrer',
          style: { color: 'inherit', textDecoration: 'underline', display: 'inline-block', marginTop: 6, fontSize: '0.9em' },
        }, t.open),
      );
    }
    // Shared state: the apply(ctx) that owns DSH locale access, and a ref
    // to the live iframe so postMessage can reach the viewer.
    let applyCtx = null;
    const frameRef = { current: null };
    function getActiveLang() {
      if (applyCtx && applyCtx.locale && typeof applyCtx.locale.getLocale === 'function') {
        const active = applyCtx.locale.getLocale().active;
        return active === 'zh' ? 'zh' : 'en';
      }
      return 'en';
    }

    // --- Registration ---
    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        applyCtx = ctx;
        // DSH re-evaluates registered label functions when the locale changes,
        // so reading the active locale here keeps nav/settings copy in sync
        // without depending on the registry being bound first.
        const navLabel = () => (getActiveLang() === 'zh' ? zh.nav : en.nav);
        const sectionLabel = () => (getActiveLang() === 'zh' ? zh.settings : en.settings);

        // 1) Main panel content (required so selectPanel('memos') can render).
        ctx.slots.inject('main', () => ctx.slots.register({
          name: 'main',
          key: NODE,
        }, MemoryPanel));

        // 2) Left navigation entry alongside Conversation / Trajectory.
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist',
          id: NODE,
          order: 60,
          label: navLabel,
        }, MemoryNavIcon));

        // 3) Settings section.
        ctx.slots.inject('settings.section', () => ctx.slots.register({
          name: 'settings.section',
          id: NODE,
          order: 60,
          label: sectionLabel,
        }, MemorySettingsSection));
      },
    };
  },
});