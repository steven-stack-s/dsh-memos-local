// MemOS memory client bundle for DeepSeek Harness (DSH).
//
// Hand-written per DSH's cordis-plugin-development convention:
//   window.__ModuleLoader__.load({ id, factory }) registers a lazy browser
//   module. React is provided by the browser module table. This bundle
//   contributes:
//     1. a "Memory" panel entry in the left navigation (sidebar.panellist),
//        alongside Conversation / Trajectory; and
//     2. a "Memory (Memos)" configuration section in DSH Settings
//        (settings.section).
//
window.__ModuleLoader__.load({
  id: 'dsh-memos-local',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    const MEMOS_NODE = 'memos';

    // --- Small icon for the left navigation panel entry (sidebar.panellist) ---
    function MemoryNavIcon() {
      return h('svg', {
        viewBox: '0 0 24 24',
        width: 20,
        height: 20,
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 2,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': true,
      },
        // a simple "memory chip" glyph
        h('rect', { x: 4, y: 4, width: 10, height: 10, rx: 2 }),
        h('path', { d: 'M4 14h4v6' }),
        h('path', { d: 'M14 9h6v10' }),
        h('path', { d: 'M9 20v-2M20 19v-2' }),
      );
    }

    // --- Configuration / status section in DSH Settings (settings.section) ---
    // Reads the host-side viewer endpoint health. Kept minimal on purpose:
    // this is the "wire link" proof for the client bundle.
    function MemosSettingsSection(props) {
      const [state, setState] = React.useState('checking');
      React.useEffect(() => {
        let alive = true;
        const port = props.port ?? 18801;
        fetch('http://127.0.0.1:' + port + '/api/health', { signal: AbortSignal.timeout(2000) })
          .then((res) => { if (alive) setState(res.ok ? 'online' : 'offline'); })
          .catch(() => { if (alive) setState('offline'); });
        return () => { alive = false; };
      }, [props.port]);
      const statusText =
        state === 'online' ? 'Viewer service online on port 18801' :
        state === 'offline' ? 'Viewer service offline / unreachable' : 'Checking viewer status…';
      return h('div', { style: { padding: '8px 0' } },
        h('div', { style: { fontSize: 13, opacity: 0.8, marginBottom: 8 } },
          'Memory plugin (dsh-memos-local). Memory is captured and retrieved by the host agent automatically.'),
        h('div', { style: { fontSize: 13 } }, statusText),
        h('a', {
          href: 'http://127.0.0.1:' + (props.port ?? 18801),
          target: '_blank',
          rel: 'noreferrer',
          style: { color: 'inherit', textDecoration: 'underline', marginTop: 8, display: 'inline-block' },
        }, 'Open Memory Viewer'),
      );
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        // 1) Left navigation "Memory" entry (alongside Conversation/Trajectory).
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist',
          id: MEMOS_NODE,
          order: 60,
          label: () => 'Memory',
          locale: '@local/memos',
        }, MemoryNavIcon));

        // 2) DSH Settings configuration section.
        ctx.slots.inject('settings.section', () => ctx.slots.register({
          name: 'settings.section',
          id: MEMOS_NODE,
          order: 60,
          label: () => 'Memory (Memos)',
          locale: '@local/memos',
          inject: () => ({ port: 18801 }),
        }, MemosSettingsSection));
      },
    };
  },
});
