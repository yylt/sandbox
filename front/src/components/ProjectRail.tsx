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

export function ProjectRail() {
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
    } catch {}
    setSelecting(null);
  };

  return (
    <>
      <div className="w-14 flex flex-col items-center bg-white dark:bg-[#0d1117] border-r border-gray-200 dark:border-slate-800 py-3 gap-2 shrink-0">
        <div className="text-gray-400 dark:text-slate-500 text-[10px] uppercase tracking-widest mb-1">Proj</div>

        {/* Active project avatar */}
        {activeProject && (
          <div
            title={`${activeProject.name}\n${activeProject.rootPath ?? ''}`}
            className={`w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-sm select-none ${colorForPath(activeProject.rootPath ?? activeProject.id)}`}
          >
            {activeProject.name.charAt(0).toUpperCase()}
          </div>
        )}

        <div className="flex-1" />

        {/* Open button */}
        <button
          onClick={openDialog}
          title="Open project"
          className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-slate-800 hover:bg-indigo-600 text-gray-400 dark:text-slate-400 hover:text-white flex items-center justify-center transition-colors"
        >
          <FolderOpen size={14} />
        </button>
      </div>

      {/* Directory picker dialog */}
      {dialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setDialogOpen(false)}>
          <div
            className="bg-white dark:bg-[#161b22] rounded-xl shadow-2xl w-96 max-h-[70vh] flex flex-col border border-gray-200 dark:border-slate-700"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-slate-700">
              <span className="text-sm font-semibold text-gray-700 dark:text-slate-200">Open Project</span>
              <button
                onClick={() => setDialogOpen(false)}
                className="text-gray-400 hover:text-gray-700 dark:hover:text-white text-lg leading-none"
              >×</button>
            </div>
            <div className="flex-1 overflow-y-auto py-2">
              {loading && (
                <div className="flex items-center justify-center py-8 text-gray-400">
                  <Loader2 size={20} className="animate-spin mr-2" />
                  <span className="text-sm">Loading...</span>
                </div>
              )}
              {!loading && entries.length === 0 && (
                <div className="text-center text-sm text-gray-400 py-8">No directories found</div>
              )}
              {!loading && entries.map(entry => (
                <button
                  key={entry.path}
                  onClick={() => selectDir(entry)}
                  disabled={selecting === entry.path}
                  className="w-full text-left px-4 py-2.5 flex items-center gap-3 hover:bg-indigo-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-60"
                >
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm shrink-0 ${colorForPath(entry.path)}`}>
                    {selecting === entry.path
                      ? <Loader2 size={14} className="animate-spin" />
                      : entry.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-gray-700 dark:text-slate-200 truncate">{entry.name}</div>
                    <div className="text-[11px] text-gray-400 dark:text-slate-500 truncate">{entry.path}</div>
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

