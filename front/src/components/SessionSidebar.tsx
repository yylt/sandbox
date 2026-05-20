import { useEffect, useState, useRef, useCallback } from 'react';
import { MessageSquare, Plus, Trash2, Clock, AlertTriangle } from 'lucide-react';
import { sessionsApi } from '../api/client';
import { useAppStore } from '../store/AppContext';
import { cn } from '../lib/utils';
import type { Session } from '../api/types';

export function SessionSidebar() {
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
        className="flex flex-col bg-gray-50 dark:bg-[#161b22] border-r border-gray-200 dark:border-slate-800 shrink-0 relative"
        style={{ width }}
      >
        <div className="flex items-center justify-between px-3 py-3 border-b border-gray-200 dark:border-slate-800">
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-slate-300">
            <MessageSquare size={14} />
            <span>Sessions</span>
          </div>
          {activeProject && (
            <button
              onClick={() => setCreating(true)}
              className="w-6 h-6 rounded flex items-center justify-center bg-gray-200 dark:bg-slate-700 hover:bg-indigo-600 text-gray-500 dark:text-slate-400 hover:text-white transition-colors"
              title="New session"
            >
              <Plus size={13} />
            </button>
          )}
        </div>

        {!activeProject && (
          <div className="flex-1 flex items-center justify-center text-gray-400 dark:text-slate-600 text-xs px-4 text-center">
            Select a project to view sessions
          </div>
        )}

        {activeProject && (
          <div className="flex-1 overflow-y-auto py-1">
            {creating && (
              <div className="px-2 py-1">
                <input
                  autoFocus
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') setCreating(false); }}
                  onBlur={() => { if (!newName) setCreating(false); }}
                  className="w-full text-xs bg-gray-100 dark:bg-slate-700 text-gray-800 dark:text-white rounded px-2 py-1 outline-none border border-indigo-400"
                  placeholder="Session name"
                />
              </div>
            )}

            {sessions.length === 0 && !creating && (
              <div className="text-gray-400 dark:text-slate-600 text-xs text-center mt-8">No sessions yet</div>
            )}

            {sessions.map(s => (
              <div
                key={s.id}
                onClick={() => setActiveSession(s)}
                className={cn(
                  'group flex items-start gap-2 px-3 py-2 cursor-pointer rounded-md mx-1 my-0.5 transition-colors',
                  activeSession?.id === s.id
                    ? 'bg-indigo-50 dark:bg-slate-700 text-indigo-700 dark:text-white'
                    : 'text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800 hover:text-gray-800 dark:hover:text-slate-200'
                )}
              >
                <div className={cn('w-2 h-2 rounded-full mt-1.5 shrink-0', statusColor(s.status))} />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium truncate">{s.name}</div>
                  <div className="flex items-center gap-1 text-[10px] text-gray-400 dark:text-slate-500 mt-0.5">
                    <Clock size={9} />
                    <span>{new Date(s.updatedAt).toLocaleDateString()}</span>
                  </div>
                </div>
                <button
                  onClick={e => handleDelete(e, s)}
                  className="hidden group-hover:flex items-center justify-center w-5 h-5 rounded hover:bg-red-50 dark:hover:bg-red-500/20 text-gray-400 dark:text-slate-500 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                >
                  <Trash2 size={11} />
                </button>
              </div>
            ))}
          </div>
        )}

        {activeProject && (
          <div className="border-t border-gray-200 dark:border-slate-800">
            <div className="flex items-center justify-between px-3 py-2">
              <span className="text-[10px] text-gray-400 dark:text-slate-500">
                {sessions.length} session{sessions.length !== 1 ? 's' : ''}
              </span>
              {sessions.length > 0 && (
                <button
                  onClick={() => setConfirmClearOpen(true)}
                  className="text-[10px] text-red-400 hover:text-red-500 dark:text-red-500 dark:hover:text-red-400 flex items-center gap-1 transition-colors"
                  title="Clear all sessions"
                >
                  <Trash2 size={10} />
                  <span>Clear all</span>
                </button>
              )}
            </div>
            <div className="px-3 pb-2 text-[10px] text-gray-400 dark:text-slate-600 truncate">
              {activeProject.name}
              {activeProject.rootPath && <div className="truncate opacity-60">{activeProject.rootPath}</div>}
            </div>
          </div>
        )}

        {/* Resize handle */}
        <div
          onMouseDown={onMouseDown}
          className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-indigo-400/50 transition-colors z-10"
        />
      </div>

      {/* Confirm clear dialog */}
      {confirmClearOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setConfirmClearOpen(false)}>
          <div
            className="bg-white dark:bg-[#161b22] rounded-xl shadow-2xl w-80 border border-gray-200 dark:border-slate-700 p-5"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center shrink-0">
                <AlertTriangle size={18} className="text-red-500" />
              </div>
              <div>
                <div className="text-sm font-semibold text-gray-800 dark:text-slate-200">Clear all sessions?</div>
                <div className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">This will delete all {sessions.length} sessions and their messages.</div>
              </div>
            </div>
            <div className="flex gap-2 justify-end mt-4">
              <button
                onClick={() => setConfirmClearOpen(false)}
                className="px-3 py-1.5 text-xs rounded-lg bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleClearAll}
                className="px-3 py-1.5 text-xs rounded-lg bg-red-500 hover:bg-red-600 text-white transition-colors"
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

