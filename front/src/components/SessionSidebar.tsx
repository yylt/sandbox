import { useEffect, useState, useRef, useCallback } from 'react';
import { MessageSquare, Plus, Trash2, Clock, AlertTriangle } from 'lucide-react';
import { sessionsApi } from '../api/client';
import { useAppStore } from '../store/AppContext';
import { cn } from '../lib/utils';
import type { Session } from '../api/types';

interface Props {
  onSessionSelected?: () => void;
}

export function SessionSidebar({ onSessionSelected }: Props) {
  const { activeProject, sessions, activeSession, setSessions, setActiveSession } = useAppStore();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const [width, setWidth] = useState(224);
  const dragging = useRef(false);
  const startX = useRef(0);
  const startW = useRef(0);

  useEffect(() => {
    if (!activeProject) { setSessions([]); return; }
    sessionsApi.list(activeProject.id).then(r => {
      setSessions(r.items);
      if (r.items.length > 0) setActiveSession(r.items[0]);
    }).catch(() => {});
  }, [activeProject, setSessions, setActiveSession]);

  const handleCreate = async () => {
    if (!activeProject || !newName.trim()) return;
    try {
      const s = await sessionsApi.create(activeProject.id, { name: newName.trim() });
      setSessions(prev => [s, ...prev]);
      setActiveSession(s);
      onSessionSelected?.();
    } catch {}
    setNewName('');
    setCreating(false);
  };

  const handleDelete = async (e: React.MouseEvent, s: Session) => {
    e.stopPropagation();
    if (!activeProject) return;
    try {
      await sessionsApi.delete(activeProject.id, s.id);
      const next = sessions.filter(x => x.id !== s.id);
      setSessions(next);
      if (activeSession?.id === s.id) setActiveSession(next[0] ?? null);
    } catch {}
  };

  const handleClearAll = async () => {
    if (!activeProject) return;
    try {
      await sessionsApi.deleteAll(activeProject.id);
      setSessions([]);
      setActiveSession(null);
    } catch {}
    setConfirmClearOpen(false);
  };

  const statusColor = (s: Session['status']) => ({
    active: 'bg-emerald-500',
    idle: 'bg-yellow-500',
    terminated: 'bg-gray-400 dark:bg-slate-500',
  }[s]);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    dragging.current = true;
    startX.current = e.clientX;
    startW.current = width;
    e.preventDefault();

    const onMove = (ev: MouseEvent) => {
      if (!dragging.current) return;
      const delta = ev.clientX - startX.current;
      setWidth(Math.max(160, Math.min(400, startW.current + delta)));
    };
    const onUp = () => {
      dragging.current = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [width]);

  return (
    <>
      <div
        className="relative flex flex-col border-r border-rose-100/80 bg-white/55 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/65 shrink-0"
        style={{ width }}
      >
        <div className="flex items-center justify-between border-b border-rose-100/80 px-4 py-4 dark:border-slate-800">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
            <MessageSquare size={14} />
            <span>Sessions</span>
          </div>
          {activeProject && (
            <button
              onClick={() => setCreating(true)}
              className="flex h-9 w-9 items-center justify-center rounded-2xl border border-rose-100 bg-white text-slate-500 shadow-sm transition-all hover:-translate-y-px hover:bg-rose-50 hover:text-rose-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
              title="New session"
            >
              <Plus size={15} />
            </button>
          )}
        </div>

        {!activeProject && (
          <div className="flex flex-1 items-center justify-center px-5 text-center text-sm text-slate-400 dark:text-slate-500">
            Select a project to view sessions
          </div>
        )}

        {activeProject && (
          <div className="flex-1 overflow-y-auto px-2 py-3">
            {creating && (
              <div className="px-1 py-1">
                <input
                  autoFocus
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') setCreating(false); }}
                  onBlur={() => { if (!newName) setCreating(false); }}
                  className="w-full rounded-2xl border border-rose-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition-colors placeholder:text-slate-400 focus:border-rose-300 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  placeholder="Session name"
                />
              </div>
            )}

            {sessions.length === 0 && !creating && (
              <div className="mt-10 text-center text-sm text-slate-400 dark:text-slate-500">No sessions yet</div>
            )}

            {sessions.map(s => (
              <div
                key={s.id}
                onClick={() => {
                  setActiveSession(s);
                  onSessionSelected?.();
                }}
                className={cn(
                  'group mx-1 my-1 flex cursor-pointer items-start gap-3 rounded-2xl px-3 py-3 transition-all',
                  activeSession?.id === s.id
                    ? 'bg-white text-rose-700 shadow-[0_10px_30px_rgba(244,114,182,0.12)] ring-1 ring-rose-100 dark:bg-slate-900 dark:text-white dark:ring-slate-700'
                    : 'text-slate-600 hover:bg-white/80 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-slate-200'
                )}
              >
                <div className={cn('mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full', statusColor(s.status))} />
                <div className="flex-1 min-w-0">
                  <div className="truncate text-sm font-medium">{s.name}</div>
                  <div className="mt-1 flex items-center gap-1 text-[11px] text-slate-400 dark:text-slate-500">
                    <Clock size={9} />
                    <span>{new Date(s.updatedAt).toLocaleDateString()}</span>
                  </div>
                </div>
                <button
                  onClick={e => handleDelete(e, s)}
                  className="hidden h-7 w-7 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:text-slate-500 dark:hover:bg-red-500/20 dark:hover:text-red-400 group-hover:flex"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        )}

        {activeProject && (
          <div className="border-t border-rose-100/80 px-4 py-3 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-slate-400 dark:text-slate-500">
                {sessions.length} session{sessions.length !== 1 ? 's' : ''}
              </span>
              {sessions.length > 0 && (
                <button
                  onClick={() => setConfirmClearOpen(true)}
                  className="flex items-center gap-1 text-[11px] text-red-400 transition-colors hover:text-red-500 dark:text-red-500 dark:hover:text-red-400"
                  title="Clear all sessions"
                >
                  <Trash2 size={10} />
                  <span>Clear all</span>
                </button>
              )}
            </div>
            <div className="truncate pt-3 text-[11px] text-slate-400 dark:text-slate-500">
              {activeProject.name}
              {activeProject.rootPath && <div className="truncate opacity-60">{activeProject.rootPath}</div>}
            </div>
          </div>
        )}

        {/* Resize handle */}
        <div
          onMouseDown={onMouseDown}
          className="absolute right-0 top-0 z-10 h-full w-1 cursor-col-resize transition-colors hover:bg-rose-300/70 dark:hover:bg-indigo-400/50"
        />
      </div>

      {/* Confirm clear dialog */}
      {confirmClearOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 backdrop-blur-sm" onClick={() => setConfirmClearOpen(false)}>
          <div
            className="w-full max-w-sm rounded-[28px] border border-rose-100 bg-white/95 p-5 shadow-[0_24px_80px_rgba(15,23,42,0.18)] backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/95"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
                <AlertTriangle size={18} className="text-red-500" />
              </div>
              <div>
                <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">Clear all sessions?</div>
                <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">This will delete all {sessions.length} sessions and their messages.</div>
              </div>
            </div>
            <div className="flex gap-2 justify-end mt-4">
              <button
                onClick={() => setConfirmClearOpen(false)}
                className="rounded-xl bg-rose-50 px-4 py-2 text-xs text-slate-600 transition-colors hover:bg-rose-100 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                onClick={handleClearAll}
                className="rounded-xl bg-red-500 px-4 py-2 text-xs text-white transition-colors hover:bg-red-600"
              >
                Delete all
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
