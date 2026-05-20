import { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal as TerminalIcon, Plus, X, Loader2 } from 'lucide-react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { terminalsApi } from '../api/client';
import { useAppStore } from '../store/AppContext';
import { cn } from '../lib/utils';
import type { Terminal as TerminalInfo } from '../api/types';
import '@xterm/xterm/css/xterm.css';

interface TermTab {
  info: TerminalInfo;
  term: Terminal;
  fitAddon: FitAddon;
  ws: WebSocket | null;
}

function makeTermTab(info: TerminalInfo, isDark: boolean): TermTab {
  const term = new Terminal({
    theme: isDark ? {
      background: '#0d1117',
      foreground: '#e2e8f0',
      cursor: '#7c3aed',
      selectionBackground: '#334155',
    } : {
      background: '#ffffff',
      foreground: '#1e293b',
      cursor: '#4f46e5',
      selectionBackground: '#e0e7ff',
    },
    fontSize: 13,
    fontFamily: '"Cascadia Code", "Fira Code", monospace',
    cursorBlink: true,
  });
  const fitAddon = new FitAddon();
  term.loadAddon(fitAddon);

  const wsUrl = terminalsApi.wsUrl(info.id);
  const ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    term.write('\r\n\x1b[32m✓ Terminal connected\x1b[0m\r\n');
  };
  ws.onmessage = evt => {
    try {
      const frame = JSON.parse(evt.data);
      if (frame.type === 'output') {
        term.write(atob(frame.data));
      }
    } catch {
      term.write(evt.data);
    }
  };
  ws.onerror = () => term.write('\r\n\x1b[31m✗ WebSocket error\x1b[0m\r\n');
  ws.onclose = () => term.write('\r\n\x1b[33mConnection closed\x1b[0m\r\n');

  term.onData(data => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'input', data: btoa(data) }));
    }
  });

  return { info, term, fitAddon, ws };
}

export function TerminalPanel() {
  const { activeProject, theme } = useAppStore();
  const [tabs, setTabs] = useState<TermTab[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [restored, setRestored] = useState(false);
  const containerRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const isDark = theme === 'dark';

  const getActive = useCallback(() => tabs.find(t => t.info.id === activeId) ?? null, [tabs, activeId]);

  // Restore existing terminals from backend on first mount
  useEffect(() => {
    if (restored) return;
    setRestored(true);
    terminalsApi.list().then(res => {
      const running = (res.items ?? []).filter(t => t.status === 'running');
      if (running.length === 0) return;
      const newTabs = running.map(info => makeTermTab(info, isDark));
      setTabs(newTabs);
      setActiveId(newTabs[newTabs.length - 1]?.info.id ?? null);
    }).catch(() => {});
  }, [restored, isDark]);

  const attachTerminal = useCallback((id: string, el: HTMLDivElement | null) => {
    if (!el) return;
    containerRefs.current[id] = el;
    const tab = tabs.find(t => t.info.id === id);
    if (!tab) return;
    if (el.children.length === 0) {
      tab.term.open(el);
      tab.fitAddon.fit();
    }
  }, [tabs]);

  const createTerminal = useCallback(async () => {
    if (!activeProject) return;
    setCreating(true);
    try {
      const info = await terminalsApi.create({
        cwd: activeProject.rootPath ?? '/tmp',
        cols: 120,
        rows: 30,
      });
      const newTab = makeTermTab(info, isDark);
      setTabs(prev => [...prev, newTab]);
      setActiveId(info.id);
    } catch (e) {
      console.error('Failed to create terminal', e);
    } finally {
      setCreating(false);
    }
  }, [activeProject, isDark]);

  const closeTab = useCallback(async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const tab = tabs.find(t => t.info.id === id);
    if (tab) {
      tab.ws?.close();
      tab.term.dispose();
      await terminalsApi.delete(id).catch(() => {});
    }
    setTabs(prev => {
      const next = prev.filter(t => t.info.id !== id);
      if (activeId === id) setActiveId(next[next.length - 1]?.info.id ?? null);
      return next;
    });
  }, [tabs, activeId]);

  useEffect(() => {
    const tab = getActive();
    if (!tab) return;
    const el = containerRefs.current[tab.info.id];
    if (!el) return;
    const observer = new ResizeObserver(() => {
      tab.fitAddon.fit();
      terminalsApi.resize(tab.info.id, { cols: tab.term.cols, rows: tab.term.rows }).catch(() => {});
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [activeId, getActive]);

  return (
    <div className="flex flex-col" style={{ minHeight: 260 }}>
      <div className={cn(
        'flex items-center gap-1 px-2 py-1.5 border-b',
        isDark ? 'border-slate-700 bg-[#0d1117]' : 'border-gray-200 bg-gray-50'
      )}>
        <TerminalIcon size={13} className="text-emerald-500 shrink-0" />
        <div className="flex items-center gap-0.5 flex-1 overflow-x-auto">
          {tabs.map(tab => (
            <button
              key={tab.info.id}
              onClick={() => setActiveId(tab.info.id)}
              className={cn(
                'flex items-center gap-1 px-2.5 py-0.5 rounded text-xs whitespace-nowrap transition-colors',
                activeId === tab.info.id
                  ? isDark ? 'bg-slate-700 text-white' : 'bg-gray-200 text-gray-800'
                  : isDark ? 'text-slate-400 hover:bg-slate-800 hover:text-slate-200' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
              )}
            >
              <TerminalIcon size={10} />
              <span>{tab.info.cwd ? tab.info.cwd.split('/').filter(Boolean).pop() ?? tab.info.id.slice(0, 6) : tab.info.id.slice(0, 6)}</span>
              <X
                size={10}
                onClick={e => closeTab(tab.info.id, e)}
                className="hover:text-red-400 transition-colors"
              />
            </button>
          ))}
        </div>
        <button
          onClick={createTerminal}
          disabled={creating || !activeProject}
          className={cn(
            'p-1 rounded transition-colors disabled:opacity-40',
            isDark
              ? 'hover:bg-slate-700 text-slate-400 hover:text-emerald-400'
              : 'hover:bg-gray-100 text-gray-400 hover:text-emerald-600'
          )}
          title="New terminal"
        >
          {creating ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
        </button>
      </div>

      <div className={cn(
        'flex-1 relative overflow-hidden',
        isDark ? 'bg-[#0d1117]' : 'bg-white'
      )} style={{ minHeight: 200 }}>
        {tabs.length === 0 && (
          <div className={cn(
            'absolute inset-0 flex items-center justify-center flex-col gap-2',
            isDark ? 'text-slate-600' : 'text-gray-400'
          )}>
            <TerminalIcon size={32} className="opacity-20" />
            <p className="text-xs">
              {activeProject ? 'Click + to open a terminal' : 'Select a project first'}
            </p>
          </div>
        )}
        {tabs.map(tab => (
          <div
            key={tab.info.id}
            ref={el => attachTerminal(tab.info.id, el)}
            className={cn('absolute inset-0 p-1', activeId === tab.info.id ? 'block' : 'hidden')}
          />
        ))}
      </div>
    </div>
  );
}
