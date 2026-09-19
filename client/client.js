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
      desc: '记忆插件（dsh-memos-local）。主机 agent 会自动捕获与检索记忆；查看器展示全部已存储条目。',
      open: '打开记忆查看器',
      authOn: '密码保护已开启',
      authOff: '密码保护已关闭',
      authLabel: '认证',
      authHint: '开启后访问记忆查看器需输入密码；关闭后直连 dsh-remote 认证，无需二次登录。',
      authSwitchOn: '关闭',
      authSwitchOff: '开启',
      authBusy: '处理中…',
      authErr: '操作失败，请稍后重试',
    };
    const en = {
      nav: 'Memory',
      settings: 'Memory (MemOS)',
      panelTitle: 'Memory',
      statusOnline: 'Viewer online on port 18801',
      statusOffline: 'Viewer offline / unreachable',
      statusChecking: 'Checking viewer status…',
      desc: 'Memory plugin (dsh-memos-local). Memory is captured and retrieved by the host agent automatically; the viewer shows all stored items.',
      open: 'Open Memory Viewer',
      authOn: 'Password protection enabled',
      authOff: 'Password protection disabled',
      authLabel: 'Authentication',
      authHint: 'When enabled, viewing memory requires a password. Turn it off to rely on dsh-remote auth with no extra login.',
      authSwitchOn: 'Disable',
      authSwitchOff: 'Enable',
      authBusy: 'Processing…',
      authErr: 'Operation failed, please retry',
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
      // authStatus: null=unknown, {enabled:bool}, 'err' on fetch failure
      const [authEnabled, setAuthEnabled] = React.useState(null);
      const [authBusy, setAuthBusy] = React.useState(false);
      const [authErr, setAuthErr] = React.useState(false);
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
          .catch(() => {
            setState('offline');
            setAuthEnabled(null);
          });
      };
      React.useEffect(() => { refresh(); }, []);
      const t = lang === 'zh' ? zh : en;
      const statusText =
        state === 'online' ? t.statusOnline :
        state === 'offline' ? t.statusOffline : t.statusChecking;
      // Layouts — re-created each render so DSH slot proxies re-read props.
      const row = function () {
        const kids = Array.prototype.slice.call(arguments);
        return h('div', {
          style: {
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: 12, padding: '6px 0',
          },
        }, kids);
      };
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
      return h('div', { style: { padding: '8px 0', fontSize: 13, lineHeight: 1.6 } },
        h('div', { style: { opacity: 0.75, marginBottom: 8 } }, t.desc),
        h('div', {}, statusText),
        row(
          h('div', { style: { display: 'flex', flexDirection: 'column', gap: 2 } },
            h('span', { style: { fontWeight: 600 } }, t.authLabel + ': ' + (authEnabled === null ? '…' : (authEnabled ? t.authOn : t.authOff))),
            h('span', { style: { opacity: 0.65, fontSize: 12 } }, t.authHint),
            authErr ? h('span', { style: { color: '#ff4d4f', fontSize: 12 } }, t.authErr) : null,
          ),
          toggle,
        ),
        h('a', { href: '/memos/', target: '_blank', rel: 'noreferrer',
          style: { color: 'inherit', textDecoration: 'underline', display: 'inline-block', marginTop: 8 } },
          t.open),
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