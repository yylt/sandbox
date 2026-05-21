import { useEffect, useState } from 'react';
import { AppProvider, useAppStore } from './store/AppContext';
import { ProjectRail } from './components/ProjectRail';
import { SessionSidebar } from './components/SessionSidebar';
import { ChatArea } from './components/ChatArea';
import { ToolPanel } from './components/ToolPanel';
import { Bot, FolderOpen, PanelRightClose, X } from 'lucide-react';

function Layout() {
  const { theme, fontScale, activeProject, activeSession } = useAppStore();
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [mobileToolsOpen, setMobileToolsOpen] = useState(false);

  useEffect(() => {
    const media = window.matchMedia('(min-width: 1024px)');
    const onChange = (event: MediaQueryListEvent | MediaQueryList) => {
      if (event.matches) {
        setMobileNavOpen(false);
        setMobileToolsOpen(false);
      }
    };

    onChange(media);
    const listener = (event: MediaQueryListEvent) => onChange(event);
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, []);

  const closeMobilePanels = () => {
    setMobileNavOpen(false);
    setMobileToolsOpen(false);
  };

  const title = activeSession?.name || activeProject?.name || 'Agent Sandbox';

  return (
    <div
      className={theme === 'dark' ? 'dark' : ''}
      style={{
        height: '100vh',
        overflow: 'hidden',
        ['--ui-font-scale' as string]: fontScale === 'compact' ? '0.92' : fontScale === 'comfortable' ? '1.08' : '1',
      }}
    >
      <div className="relative flex h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(125,211,252,0.22),_transparent_28%),radial-gradient(circle_at_top_right,_rgba(196,181,253,0.20),_transparent_24%),linear-gradient(180deg,_#f6f9fd_0%,_#eef4fb_42%,_#f5f8fc_100%)] text-slate-800 dark:bg-[radial-gradient(circle_at_top_left,_rgba(96,165,250,0.16),_transparent_28%),radial-gradient(circle_at_top_right,_rgba(139,92,246,0.18),_transparent_24%),linear-gradient(180deg,_#08111f_0%,_#091320_42%,_#07101c_100%)] dark:text-slate-100">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.28),transparent_36%,rgba(191,219,254,0.24)_72%,transparent)] dark:bg-[linear-gradient(135deg,rgba(94,234,212,0.04),transparent_35%,rgba(96,165,250,0.06)_70%,transparent)]" />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-sky-300/20 blur-3xl dark:bg-cyan-400/6" />

        <div className="absolute inset-0 flex flex-col lg:hidden">
          <div className="flex items-center gap-3 border-b border-slate-200/80 bg-white/80 px-4 py-3 backdrop-blur-xl dark:border-cyan-400/15 dark:bg-slate-950/80">
            <button
              onClick={() => {
                setMobileNavOpen(true);
                setMobileToolsOpen(false);
              }}
              className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white/88 text-slate-600 shadow-[0_10px_30px_rgba(148,163,184,0.18)] transition-colors hover:bg-slate-50 dark:border-cyan-400/20 dark:bg-slate-900/90 dark:text-slate-300 dark:shadow-[0_0_0_1px_rgba(14,165,233,0.05),0_10px_30px_rgba(2,6,23,0.45)] dark:hover:bg-slate-800"
              title="打开导航"
            >
              <FolderOpen size={18} />
            </button>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100" data-ui-heading="true">{title}</div>
              <div className="flex items-center gap-1 text-[11px] uppercase tracking-[0.24em] text-slate-500 dark:text-cyan-200/55">
                <Bot size={12} />
                <span className="truncate">Agent Console</span>
              </div>
            </div>
            <button
              onClick={() => {
                setMobileToolsOpen(true);
                setMobileNavOpen(false);
              }}
              className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white/88 text-slate-600 shadow-[0_10px_30px_rgba(148,163,184,0.18)] transition-colors hover:bg-slate-50 dark:border-cyan-400/20 dark:bg-slate-900/90 dark:text-slate-300 dark:shadow-[0_0_0_1px_rgba(14,165,233,0.05),0_10px_30px_rgba(2,6,23,0.45)] dark:hover:bg-slate-800"
              title="打开工具"
            >
              <PanelRightClose size={18} />
            </button>
          </div>
        </div>

        <div className="hidden lg:flex lg:h-full lg:min-w-0 lg:flex-1">
          <ProjectRail />
          <SessionSidebar />
          <ChatArea terminalOpen={terminalOpen} onTerminalToggle={() => setTerminalOpen(v => !v)} onTerminalClose={() => setTerminalOpen(false)} />
          <ToolPanel onTerminalToggle={() => setTerminalOpen(v => !v)} terminalOpen={terminalOpen} />
        </div>

        <div className="flex h-full min-w-0 flex-1 flex-col pt-[68px] lg:hidden">
          <ChatArea terminalOpen={terminalOpen} onTerminalToggle={() => setTerminalOpen(v => !v)} onTerminalClose={() => setTerminalOpen(false)} />
        </div>

        {(mobileNavOpen || mobileToolsOpen) && (
          <div className="absolute inset-0 z-40 lg:hidden" aria-hidden={!mobileNavOpen && !mobileToolsOpen}>
            <button
              className="absolute inset-0 bg-slate-950/45 backdrop-blur-[2px]"
              onClick={closeMobilePanels}
              aria-label="关闭面板"
            />

            {mobileNavOpen && (
              <div className="absolute inset-y-0 left-0 flex w-[min(92vw,26rem)] max-w-full border-r border-slate-200 bg-white/94 shadow-[0_24px_80px_rgba(148,163,184,0.18)] backdrop-blur-xl dark:border-cyan-400/15 dark:bg-slate-950/96 dark:shadow-[0_24px_80px_rgba(2,6,23,0.55)]">
                <div className="flex min-w-0 flex-1 pt-safe">
                  <ProjectRail onProjectSelected={closeMobilePanels} />
                  <SessionSidebar onSessionSelected={closeMobilePanels} />
                </div>
                <button
                  onClick={closeMobilePanels}
                  className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white/92 text-slate-500 shadow-sm dark:border-cyan-400/20 dark:bg-slate-900/92 dark:text-slate-300"
                  title="关闭导航"
                >
                  <X size={16} />
                </button>
              </div>
            )}

            {mobileToolsOpen && (
              <div className="absolute inset-y-0 right-0 flex w-[min(92vw,24rem)] max-w-full border-l border-slate-200 bg-white/94 shadow-[-24px_24px_80px_rgba(148,163,184,0.18)] backdrop-blur-xl dark:border-cyan-400/15 dark:bg-slate-950/96 dark:shadow-[-24px_24px_80px_rgba(2,6,23,0.55)]">
                <div className="min-w-0 flex-1">
                  <ToolPanel onTerminalToggle={() => setTerminalOpen(v => !v)} terminalOpen={terminalOpen} mobileMode />
                </div>
                <button
                  onClick={closeMobilePanels}
                  className="absolute left-3 top-3 flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white/92 text-slate-500 shadow-sm dark:border-cyan-400/20 dark:bg-slate-900/92 dark:text-slate-300"
                  title="关闭工具"
                >
                  <X size={16} />
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <Layout />
    </AppProvider>
  );
}
