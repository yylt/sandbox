import { useState } from 'react';
import { FolderOpen, Loader2 } from 'lucide-react';
import { workdirApi, projectsApi } from '../api/client';
import { useAppStore } from '../store/AppContext';
import type { WorkdirEntry } from '../api/types';

const COLORS = [
  'bg-rose-500', 'bg-orange-500', 'bg-amber-500', 'bg-lime-500',
  'bg-emerald-500', 'bg-teal-500', 'bg-cyan-500', 'bg-sky-500',
  'bg-blue-500', 'bg-violet-500', 'bg-purple-500', 'bg-pink-500',
];

function colorForPath(path: string): string {
  let h = 0;
  for (let i = 0; i < path.length; i++) h = (h * 31 + path.charCodeAt(i)) >>> 0;
  return COLORS[h % COLORS.length];
}

interface Props {
  onProjectSelected?: () => void;
}

export function ProjectRail({ onProjectSelected }: Props) {
  const { activeProject, setActiveProject } = useAppStore();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selecting, setSelecting] = useState<string | null>(null);
  const [entries, setEntries] = useState<WorkdirEntry[]>([]);

  const openDialog = async () => {
    setLoading(true);
    setDialogOpen(true);
    try {
      const res = await workdirApi.list();
      setEntries(res.items);
    } catch {}
    setLoading(false);
  };

  const selectDir = async (entry: WorkdirEntry) => {
    setSelecting(entry.path);
    try {
      const list = await projectsApi.list();
      const existing = list.items.find(p => p.rootPath === entry.path);
      if (existing) {
        setActiveProject(existing);
      } else {
        const created = await projectsApi.create({ name: entry.name, rootPath: entry.path });
        setActiveProject(created);
      }
      setDialogOpen(false);
      onProjectSelected?.();
    } catch {}
    setSelecting(null);
  };

  return (
    <>
      <div className="flex w-16 flex-col items-center gap-3 border-r border-rose-100/80 bg-white/75 px-2 py-4 shadow-[inset_-1px_0_0_rgba(255,255,255,0.35)] backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/80 shrink-0">
        <div className="mb-1 text-[10px] uppercase tracking-[0.26em] text-rose-300 dark:text-slate-500">Proj</div>

        {/* Active project avatar */}
        {activeProject && (
          <div
            title={`${activeProject.name}\n${activeProject.rootPath ?? ''}`}
            className={`flex h-11 w-11 select-none items-center justify-center rounded-2xl text-sm font-bold text-white shadow-lg shadow-rose-200/40 ${colorForPath(activeProject.rootPath ?? activeProject.id)}`}
          >
            {activeProject.name.charAt(0).toUpperCase()}
          </div>
        )}

        <div className="flex-1" />

        {/* Open button */}
        <button
          onClick={openDialog}
          title="Open project"
          className="flex h-10 w-10 items-center justify-center rounded-2xl border border-rose-100 bg-white text-slate-500 shadow-sm transition-all hover:-translate-y-px hover:bg-rose-50 hover:text-rose-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
        >
          <FolderOpen size={14} />
        </button>
      </div>

      {/* Directory picker dialog */}
      {dialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 backdrop-blur-sm" onClick={() => setDialogOpen(false)}>
          <div
            className="flex max-h-[75vh] w-full max-w-md flex-col overflow-hidden rounded-[28px] border border-rose-100 bg-white/95 shadow-[0_24px_80px_rgba(15,23,42,0.18)] backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/95"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-rose-100 px-5 py-4 dark:border-slate-800">
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-100">Open Project</span>
              <button
                onClick={() => setDialogOpen(false)}
                className="text-lg leading-none text-slate-400 transition-colors hover:text-slate-700 dark:hover:text-white"
              >×</button>
            </div>
            <div className="flex-1 overflow-y-auto px-2 py-3">
              {loading && (
                <div className="flex items-center justify-center py-10 text-slate-400 dark:text-slate-500">
                  <Loader2 size={20} className="animate-spin mr-2" />
                  <span className="text-sm">Loading...</span>
                </div>
              )}
              {!loading && entries.length === 0 && (
                <div className="py-10 text-center text-sm text-slate-400 dark:text-slate-500">No directories found</div>
              )}
              {!loading && entries.map(entry => (
                <button
                  key={entry.path}
                  onClick={() => selectDir(entry)}
                  disabled={selecting === entry.path}
                  className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left transition-colors hover:bg-rose-50 dark:hover:bg-slate-900 disabled:opacity-60"
                >
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-sm font-bold text-white shadow-sm ${colorForPath(entry.path)}`}>
                    {selecting === entry.path
                      ? <Loader2 size={14} className="animate-spin" />
                      : entry.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-slate-700 dark:text-slate-100">{entry.name}</div>
                    <div className="truncate text-[11px] text-slate-400 dark:text-slate-500">{entry.path}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
