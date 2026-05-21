import { useEffect, useState, useRef, useCallback } from 'react';
import { FolderTree, GitBranch, Settings, Terminal as TerminalIcon } from 'lucide-react';
import { FileBrowser } from './FileBrowser';
import { GitPanel } from './GitPanel';
import { SettingsPanel } from './SettingsPanel';
import { cn } from '../lib/utils';

type ActivePanel = 'files' | 'git' | 'settings' | null;

interface FlyoutProps {
  width: number;
  onWidthChange: (w: number) => void;
  children: React.ReactNode;
}

function ResizableFlyout({ width, onWidthChange, children }: FlyoutProps) {
  const dragging = useRef(false);
  const startX = useRef(0);
  const startW = useRef(0);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    dragging.current = true;
    startX.current = e.clientX;
    startW.current = width;
    e.preventDefault();

    const onMove = (ev: MouseEvent) => {
      if (!dragging.current) return;
      const delta = startX.current - ev.clientX;
      onWidthChange(Math.max(200, Math.min(600, startW.current + delta)));
    };
    const onUp = () => {
      dragging.current = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [width, onWidthChange]);

  return (
    <div
      className="relative flex flex-col overflow-hidden border-l border-slate-200 bg-white/88 backdrop-blur-xl dark:border-cyan-400/14 dark:bg-slate-950/90"
      style={{ width }}
    >
      <div
        onMouseDown={onMouseDown}
        className="absolute left-0 top-0 z-10 h-full w-1 cursor-col-resize transition-colors hover:bg-sky-200 dark:hover:bg-cyan-300/35"
      />
      <div className="flex-1 overflow-hidden flex flex-col min-h-0">
        {children}
      </div>
    </div>
  );
}

const RAIL_ITEMS = [
  { id: 'files' as const, icon: <FolderTree size={18} />, label: '文件管理器' },
  { id: 'git' as const, icon: <GitBranch size={18} />, label: 'Git 变更' },
];

interface Props {
  onTerminalToggle: () => void;
  terminalOpen: boolean;
  mobileMode?: boolean;
}

export function ToolPanel({ onTerminalToggle, terminalOpen, mobileMode = false }: Props) {
  const [active, setActive] = useState<ActivePanel>('files');
  const [flyoutWidth, setFlyoutWidth] = useState(280);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    if (mobileMode && !settingsOpen && active === null) {
      setActive('files');
    }
  }, [mobileMode, settingsOpen, active]);

  const toggle = (id: ActivePanel) => {
    if (mobileMode) {
      setSettingsOpen(false);
      setActive(id);
      return;
    }
    setActive(prev => prev === id ? null : id);
    if (settingsOpen) setSettingsOpen(false);
  };

  const toggleSettings = () => {
    if (mobileMode) {
      setSettingsOpen(true);
      setActive(null);
      return;
    }
    setSettingsOpen(v => !v);
    setActive(null);
  };

  const showFlyout = active !== null && !settingsOpen;
  const showSettings = settingsOpen;

  if (mobileMode) {
    return (
      <div className="flex h-full min-h-0 flex-col px-3 py-3">
        <div className="rounded-[22px] border border-slate-200 bg-white/84 p-2 shadow-[0_18px_40px_rgba(148,163,184,0.16)] dark:border-cyan-400/14 dark:bg-slate-950/88 dark:shadow-[0_18px_40px_rgba(2,6,23,0.3)]">
          <div className="grid grid-cols-4 gap-2">
            {RAIL_ITEMS.map(item => (
              <button
                key={item.id}
                onClick={() => toggle(item.id)}
                className={cn(
                  'flex flex-col items-center justify-center gap-1 rounded-2xl px-2 py-3 text-[11px] transition-colors',
                  active === item.id && !settingsOpen
                    ? 'bg-sky-50 text-sky-700 dark:bg-cyan-400/10 dark:text-cyan-200'
                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-slate-200'
                )}
              >
                {item.icon}
                <span>{item.label.replace('管理器', '')}</span>
              </button>
            ))}
            <button
              onClick={toggleSettings}
              className={cn(
                'flex flex-col items-center justify-center gap-1 rounded-2xl px-2 py-3 text-[11px] transition-colors',
                settingsOpen
                  ? 'bg-cyan-400/10 text-cyan-200'
                  : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
              )}
            >
              <Settings size={18} />
              <span>设置</span>
            </button>
          </div>
          <button
            onClick={onTerminalToggle}
            className={cn(
              'mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-2xl text-sm transition-colors',
              terminalOpen
                ? 'border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/24 dark:bg-emerald-400/10 dark:text-emerald-300'
                : 'border border-slate-200 bg-slate-50 text-slate-700 hover:bg-white dark:border-cyan-400/14 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
            )}
          >
            <TerminalIcon size={16} />
            <span>{terminalOpen ? '关闭终端' : '打开终端'}</span>
          </button>
        </div>

        <div className="mt-3 min-h-0 flex-1 overflow-hidden rounded-[22px] border border-slate-200 bg-white/72 shadow-[0_18px_40px_rgba(148,163,184,0.14)] dark:border-cyan-400/14 dark:bg-slate-950/74 dark:shadow-[0_18px_40px_rgba(2,6,23,0.28)]">
          {showFlyout && active === 'files' && <FileBrowser />}
          {showFlyout && active === 'git' && <GitPanel />}
          {showSettings && <SettingsPanel onClose={() => setSettingsOpen(false)} />}
        </div>
      </div>
    );
  }

  return (
    <>
      {showFlyout && (
        <ResizableFlyout width={flyoutWidth} onWidthChange={setFlyoutWidth}>
          {active === 'files' && <FileBrowser />}
          {active === 'git' && <GitPanel />}
        </ResizableFlyout>
      )}

      {showSettings && (
        <ResizableFlyout width={flyoutWidth} onWidthChange={setFlyoutWidth}>
          <SettingsPanel onClose={() => setSettingsOpen(false)} />
        </ResizableFlyout>
      )}

      {/* Icon-only rail */}
      <div className="flex w-13 shrink-0 flex-col items-center gap-2 border-l border-slate-200 bg-white/66 px-1.5 py-3 backdrop-blur-xl dark:border-cyan-400/14 dark:bg-slate-950/74">
        {RAIL_ITEMS.map(item => (
          <button
            key={item.id}
            onClick={() => toggle(item.id)}
            title={item.label}
            className={cn(
              'group relative flex h-10 w-10 items-center justify-center rounded-2xl transition-all',
              active === item.id && !settingsOpen
                ? 'bg-sky-50 text-sky-700 shadow-[inset_0_0_0_1px_rgba(96,165,250,0.12)] dark:bg-cyan-400/10 dark:text-cyan-200 dark:shadow-[inset_0_0_0_1px_rgba(34,211,238,0.12)]'
                : 'text-slate-500 hover:-translate-y-px hover:bg-slate-50 hover:text-slate-700 dark:text-slate-500 dark:hover:bg-slate-900 dark:hover:text-slate-200'
            )}
          >
            {item.icon}
            <span className="absolute right-full top-1/2 z-50 mr-2 -translate-y-1/2 whitespace-nowrap rounded bg-white px-1.5 py-0.5 text-[10px] text-slate-700 opacity-0 transition-opacity shadow-sm pointer-events-none group-hover:opacity-100 dark:bg-slate-900 dark:text-cyan-100">
              {item.label}
            </span>
          </button>
        ))}

        {/* Terminal icon – below Git */}
        <button
          onClick={onTerminalToggle}
          title="终端"
          className={cn(
            'group relative flex h-10 w-10 items-center justify-center rounded-2xl transition-all',
            terminalOpen
              ? 'bg-emerald-50 text-emerald-700 shadow-[inset_0_0_0_1px_rgba(74,222,128,0.18)] dark:bg-emerald-400/10 dark:text-emerald-300 dark:shadow-[inset_0_0_0_1px_rgba(74,222,128,0.14)]'
              : 'text-slate-500 hover:-translate-y-px hover:bg-slate-50 hover:text-slate-700 dark:text-slate-500 dark:hover:bg-slate-900 dark:hover:text-slate-200'
          )}
        >
          <TerminalIcon size={18} />
          <span className="absolute right-full top-1/2 z-50 mr-2 -translate-y-1/2 whitespace-nowrap rounded bg-slate-900 px-1.5 py-0.5 text-[10px] text-cyan-100 opacity-0 transition-opacity pointer-events-none group-hover:opacity-100">
            终端
          </span>
        </button>

        <div className="flex-1" />

        <button
          onClick={toggleSettings}
          title="设置"
          className={cn(
            'group relative flex h-10 w-10 items-center justify-center rounded-2xl transition-all',
            settingsOpen
              ? 'bg-sky-50 text-sky-700 shadow-[inset_0_0_0_1px_rgba(96,165,250,0.12)] dark:bg-cyan-400/10 dark:text-cyan-200 dark:shadow-[inset_0_0_0_1px_rgba(34,211,238,0.12)]'
              : 'text-slate-500 hover:-translate-y-px hover:bg-slate-50 hover:text-slate-700 dark:text-slate-500 dark:hover:bg-slate-900 dark:hover:text-slate-200'
          )}
        >
          <Settings size={18} />
          <span className="absolute right-full top-1/2 z-50 mr-2 -translate-y-1/2 whitespace-nowrap rounded bg-slate-900 px-1.5 py-0.5 text-[10px] text-cyan-100 opacity-0 transition-opacity pointer-events-none group-hover:opacity-100">
            设置
          </span>
        </button>
      </div>
    </>
  );
}
