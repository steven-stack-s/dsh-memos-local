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
      statusOnline: '查看器在线（端口 18801）',
      statusOffline: '查看器离线 / 不可达',
      statusChecking: '正在检查查看器状态…',
      versionLabel: '版本',
      title: 'MemOS',
      healthOk: '模型就绪',
      healthDegraded: '有模型不可用',
      healthUnknown: '模型状态未知',
      open: '打开记忆查看器',
      authOn: '密码保护已开启',
      authOff: '密码保护已关闭',
      authLabel: '认证',
      authHint: '开启后访问记忆查看器需输入密码；关闭后直连 dsh-remote 认证，无需二次登录。',
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
      statusOnline: 'Viewer online on port 18801',
      statusOffline: 'Viewer offline / unreachable',
      statusChecking: 'Checking viewer status…',
      versionLabel: 'Version',
      title: 'MemOS',
      healthOk: 'Models ready',
      healthDegraded: 'A model is unavailable',
      healthUnknown: 'Model status unknown',
      open: 'Open Memory Viewer',
      authOn: 'Password protection enabled',
      authOff: 'Password protection disabled',
      authLabel: 'Authentication',
      authHint: 'When enabled, viewing memory requires a password. Turn it off to rely on dsh-remote auth with no extra login.',
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
      const statusText =
        state === 'online' ? t.statusOnline :
        state === 'offline' ? t.statusOffline : t.statusChecking;
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
          margin: 0, padding: '5px 12px', borderRadius: 6, cursor: 'pointer',
          fontSize: 12, fontWeight: 600, border: '1px solid transparent',
          background: authEnabled ? '#ff4d4f' : '#2f8f4e',
          color: '#fff', opacity: authBusy || authEnabled === null ? 0.6 : 1,
        },
      }, authBusy ? t.authBusy : (authEnabled ? t.authSwitchOn : t.authSwitchOff));
      const authInfo = h('div', { style: { display: 'flex', flexDirection: 'column', gap: 2 } },
        h('span', { style: { fontWeight: 600 } },
          t.authLabel + ': ' + (authEnabled === null ? '\u2026' : (authEnabled ? t.authOn : t.authOff))),
        h('span', { style: { opacity: 0.65, fontSize: 12 } }, t.authHint),
        authErr ? h('span', { style: { color: '#ff4d4f', fontSize: 12 } }, t.authErr) : null,
      );
      const rowStyle = {
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 12, padding: '6px 0',
      };
      const tabs = [
        { id: 'settings', label: t.tabSettings },
        { id: 'import', label: t.tabImport },
        { id: 'help', label: t.tabHelp },
      ];
      const tabBar = h('div', {
        style: { display: 'flex', gap: 6, flexWrap: 'wrap', margin: '4px 0 10px' },
      }, tabs.map((item) => h('button', {
        key: item.id,
        type: 'button',
        onClick: () => setTab(item.id),
        style: {
          margin: 0, padding: '4px 12px', borderRadius: 999, cursor: 'pointer',
          fontSize: 12, fontWeight: 600,
          border: '1px solid ' + (tab === item.id ? 'transparent' : 'rgba(128,128,128,.35)'),
          background: tab === item.id ? '#6c279d' : 'transparent',
          color: tab === item.id ? '#fff' : 'inherit',
        },
      }, item.label)));
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
      const healthColor =
        modelOk === null ? 'rgba(128,128,128,.65)' :
        modelOk ? '#2f8f4e' : '#e0a030';
      const healthLabel =
        modelOk === null ? t.healthUnknown :
        modelOk ? t.healthOk : t.healthDegraded;
      const header = h('div', { style: { padding: '4px 0 10px' } },
        // Title row.
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 } },
          h('span', { style: { fontSize: 15, fontWeight: 700, letterSpacing: '-.01em' } }, t.title),
        ),
        // Status row: health dot + version pill + viewer status.
        h('div', {
          style: {
            display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
            fontSize: 13, lineHeight: 1.6,
          },
        },
          h('span', {
            key: 'health',
            title: healthLabel,
            'aria-label': healthLabel,
            style: {
              width: 8, height: 8, borderRadius: 999, flexShrink: 0,
              background: healthColor,
              boxShadow: '0 0 0 3px color-mix(in srgb, ' + healthColor + ' 22%, transparent)',
            },
          }),
          // Rendered unconditionally (empty until health resolves) so the
          // three status children keep a stable position across renders
          // instead of relying on diff-time insertion.
          h('span', {
            key: 'version',
            title: versionText ? t.versionLabel : undefined,
            style: versionText ? {
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              fontSize: 12, padding: '1px 8px', borderRadius: 999,
              border: '1px solid rgba(128,128,128,.35)', opacity: 0.85,
            } : { display: 'none' },
          }, versionText),
          h('span', { key: 'status', style: { opacity: 0.9 } }, statusText),
        ),
        // Auth row.
        h('div', { style: rowStyle }, authInfo, toggle),
      );
      const body =
        tab === 'import' ? frame('/import', t.tabImport) :
        tab === 'help' ? frame('/help', t.tabHelp) :
        frame('/settings', t.tabSettings);
      return h('div', { style: { padding: '8px 0', fontSize: 13, lineHeight: 1.6 } },
        header,
        tabBar,
        body,
        h('a', {
          href: '/memos/', target: '_blank', rel: 'noreferrer',
          style: { color: 'inherit', textDecoration: 'underline', display: 'inline-block', marginTop: 8 },
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