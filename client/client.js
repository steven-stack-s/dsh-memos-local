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
// in an iframe.
window.__ModuleLoader__.load({
  id: 'dsh-memos-local',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    const NODE = 'memos';
    const VIEWER_ALONE = '/memos'; // same-origin viewer mount via DSH web server

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
    // Embeds the dedicated memory viewer. DSH runs on the same host, so a
    // localhost loopback URL is used; keep it minimal and dependency-free.
    function MemoryPanel() {
      return h('iframe', {
        src: '/memos/',
        title: 'Memory',
        style: { width: '100%', height: '100%', border: '0', background: '#fff', display: 'block' },
        sandbox: 'allow-same-origin allow-scripts allow-forms allow-popups',
      });
    }

    // --- Settings section (settings.section) ---
    function MemorySettingsSection() {
      const [state, setState] = React.useState('checking');
      React.useEffect(() => {
        let alive = true;
        fetch('/memos/api/v1/auth/status', { signal: AbortSignal.timeout(2500) })
          .then((res) => { if (alive) setState(res.ok ? 'online' : 'offline'); })
          .catch(() => { if (alive) setState('offline'); });
        return () => { alive = false; };
      }, []);
      const statusText =
        state === 'online' ? 'Viewer online on port 18801' :
        state === 'offline' ? 'Viewer offline / unreachable' : 'Checking viewer status…';
      return h('div', { style: { padding: '8px 0', fontSize: 13, lineHeight: 1.6 } },
        h('div', { style: { opacity: 0.75, marginBottom: 8 } },
          'Memory plugin (dsh-memos-local). Memory is captured and retrieved by the host agent automatically; the viewer shows all stored items.'),
        h('div', {}, statusText),
        h('a', { href: '/memos/', target: '_blank', rel: 'noreferrer',
          style: { color: 'inherit', textDecoration: 'underline', display: 'inline-block', marginTop: 8 } },
          'Open Memory Viewer'),
      );
    }

    // --- Registration ---
    return {
      inject: ['slots'],
      apply(ctx) {
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
          label: () => 'Memory',
        }, MemoryNavIcon));

        // 3) Settings section.
        ctx.slots.inject('settings.section', () => ctx.slots.register({
          name: 'settings.section',
          id: NODE,
          order: 60,
          label: () => 'Memory (Memos)',
        }, MemorySettingsSection));
      },
    };
  },
});
