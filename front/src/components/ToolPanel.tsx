import { useState, useRef, useCallback } from 'react';
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
      className="flex flex-col bg-white dark:bg-[#161b22] border-l border-gray-200 dark:border-slate-800 overflow-hidden relative"
      style={{ width }}
    >
      <div
        onMouseDown={onMouseDown}
        className="absolute top-0 left-0 w-1 h-full cursor-col-resize hover:bg-indigo-400/50 transition-colors z-10"
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
}

export function ToolPanel({ onTerminalToggle, terminalOpen }: Props) {
  const [active, setActive] = useState<ActivePanel>(null);
  const [flyoutWidth, setFlyoutWidth] = useState(280);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const toggle = (id: ActivePanel) => {
    setActive(prev => prev === id ? null : id);
    if (settingsOpen) setSettingsOpen(false);
  };

  const toggleSettings = () => {
    setSettingsOpen(v => !v);
    setActive(null);
  };

  const showFlyout = active !== null && !settingsOpen;
  const showSettings = settingsOpen;

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
      <div className="w-12 flex flex-col items-center bg-white dark:bg-[#0d1117] border-l border-gray-200 dark:border-slate-800 py-3 gap-1 shrink-0">
        {RAIL_ITEMS.map(item => (
          <button
            key={item.id}
            onClick={() => toggle(item.id)}
            title={item.label}
            className={cn(
              'group relative w-9 h-9 rounded-lg flex items-center justify-center transition-colors',
              active === item.id && !settingsOpen
                ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400'
                : 'text-gray-400 dark:text-slate-500 hover:bg-gray-100 dark:hover:bg-slate-800 hover:text-gray-700 dark:hover:text-slate-200'
            )}
          >
            {item.icon}
            <span className="absolute right-full mr-2 top-1/2 -translate-y-1/2 whitespace-nowrap text-[10px] bg-gray-800 dark:bg-slate-700 text-white px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
              {item.label}
            </span>
          </button>
        ))}

        {/* Terminal icon – below Git */}
        <button
          onClick={onTerminalToggle}
          title="终端"
          className={cn(
            'group relative w-9 h-9 rounded-lg flex items-center justify-center transition-colors',
            terminalOpen
              ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400'
              : 'text-gray-400 dark:text-slate-500 hover:bg-gray-100 dark:hover:bg-slate-800 hover:text-gray-700 dark:hover:text-slate-200'
          )}
        >
          <TerminalIcon size={18} />
          <span className="absolute right-full mr-2 top-1/2 -translate-y-1/2 whitespace-nowrap text-[10px] bg-gray-800 dark:bg-slate-700 text-white px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
            终端
          </span>
        </button>

        <div className="flex-1" />

        <button
          onClick={toggleSettings}
          title="设置"
          className={cn(
            'group relative w-9 h-9 rounded-lg flex items-center justify-center transition-colors',
            settingsOpen
              ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400'
              : 'text-gray-400 dark:text-slate-500 hover:bg-gray-100 dark:hover:bg-slate-800 hover:text-gray-700 dark:hover:text-slate-200'
          )}
        >
          <Settings size={18} />
          <span className="absolute right-full mr-2 top-1/2 -translate-y-1/2 whitespace-nowrap text-[10px] bg-gray-800 dark:bg-slate-700 text-white px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
            设置
          </span>
        </button>
      </div>
    </>
  );
}

