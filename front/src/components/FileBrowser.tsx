import { useState, useCallback, useEffect } from 'react';
import { Folder, FolderOpen, File, ChevronRight, ChevronDown, RefreshCw, Loader2, X, Save } from 'lucide-react';
import { filesApi } from '../api/client';
import { useAppStore } from '../store/AppContext';
import { cn } from '../lib/utils';
import type { FileEntry } from '../api/types';

interface TreeNode extends FileEntry {
  children?: TreeNode[];
  expanded?: boolean;
  loaded?: boolean;
}

function FileIcon({ type }: { type: FileEntry['type'] }) {
  if (type === 'directory') return <Folder size={14} className="shrink-0 text-amber-500" />;
  return <File size={14} className="shrink-0 text-slate-400 dark:text-slate-500" />;
}

function TreeRow({
  node,
  depth,
  onToggle,
  selected,
  onSelect,
}: {
  node: TreeNode;
  depth: number;
  onToggle: (node: TreeNode) => void;
  selected: string | null;
  onSelect: (path: string, isFile: boolean) => void;
}) {
  return (
    <div>
      <div
        onClick={() => { onSelect(node.path, node.type === 'file'); if (node.type === 'directory') onToggle(node); }}
        className={cn(
          'flex cursor-pointer items-center gap-2 rounded-2xl px-3 py-2 text-sm transition-colors',
          selected === node.path
            ? 'bg-white text-rose-700 shadow-sm ring-1 ring-rose-100 dark:bg-slate-900 dark:text-white dark:ring-slate-700'
            : 'text-slate-600 hover:bg-rose-50/90 dark:text-slate-300 dark:hover:bg-slate-900'
        )}
        style={{ paddingLeft: 12 + depth * 14 }}
      >
        {node.type === 'directory' ? (
          node.expanded
            ? <ChevronDown size={13} className="shrink-0 text-slate-400 dark:text-slate-500" />
            : <ChevronRight size={13} className="shrink-0 text-slate-400 dark:text-slate-500" />
        ) : (
          <span className="w-3 shrink-0" />
        )}
        {node.type === 'directory' && node.expanded
          ? <FolderOpen size={14} className="shrink-0 text-amber-500" />
          : <FileIcon type={node.type} />
        }
        <span className="truncate">{node.name}</span>
        {node.size != null && node.type === 'file' && (
          <span className="ml-auto text-[11px] text-slate-400 dark:text-slate-500">{formatSize(node.size)}</span>
        )}
      </div>
      {node.expanded && node.children?.map(child => (
        <TreeRow key={child.path} node={child} depth={depth + 1} onToggle={onToggle} selected={selected} onSelect={onSelect} />
      ))}
    </div>
  );
}

function formatSize(bytes: number) {
  if (bytes < 1024) return bytes + 'B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + 'K';
  return (bytes / (1024 * 1024)).toFixed(1) + 'M';
}

interface FileEditorProps {
  path: string;
  onClose: () => void;
}

function FileEditor({ path, onClose }: FileEditorProps) {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(null);
    filesApi.readContent(path).then(r => {
      const text = r.encoding === 'base64' ? atob(r.content) : r.content;
      setContent(text);
    }).catch(e => {
      setError(e instanceof Error ? e.message : 'Failed to load');
    }).finally(() => setLoading(false));
  }, [path]);

  const save = async () => {
    setSaving(true);
    try {
      await filesApi.writeContent({ path, content, encoding: 'utf8' });
      setDirty(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const fileName = path.split('/').pop() ?? path;

  return (
    <div className="mt-2 flex h-full flex-col overflow-hidden rounded-[24px] border border-rose-100 bg-white/92 shadow-[0_14px_35px_rgba(15,23,42,0.08)] dark:border-slate-800 dark:bg-slate-950/88">
      <div className="flex shrink-0 items-center justify-between border-b border-rose-100 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/80">
        <span className="flex-1 truncate text-xs font-semibold text-slate-700 dark:text-slate-200">{fileName}{dirty ? ' •' : ''}</span>
        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={save}
            disabled={saving || !dirty}
            className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-500 disabled:opacity-40 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-indigo-300"
            title="Save (Ctrl+S)"
          >
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
          </button>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-rose-50 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
          >
            <X size={13} />
          </button>
        </div>
      </div>
      {loading && (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 size={20} className="animate-spin text-rose-500 dark:text-indigo-400" />
        </div>
      )}
      {error && <div className="px-4 py-3 text-xs text-red-500">{error}</div>}
      {!loading && !error && (
        <textarea
          value={content}
          onChange={e => { setContent(e.target.value); setDirty(true); }}
          onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); save(); } }}
          className="flex-1 w-full resize-none border-none bg-transparent p-4 font-mono text-xs leading-6 text-slate-700 outline-none dark:text-slate-200"
          spellCheck={false}
        />
      )}
    </div>
  );
}

export function FileBrowser() {
  const { activeProject } = useAppStore();
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [editingFile, setEditingFile] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rootPath = activeProject?.rootPath ?? '';

  const loadDir = useCallback(async (path: string): Promise<TreeNode[]> => {
    const res = await filesApi.list(path);
    return res.entries.map(e => ({ ...e, children: e.type === 'directory' ? [] : undefined }));
  }, []);

  const refresh = useCallback(async () => {
    if (!rootPath) return;
    setLoading(true);
    setError(null);
    try {
      const nodes = await loadDir(rootPath);
      setTree(nodes);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [rootPath, loadDir]);

  useEffect(() => {
    setTree([]);
    setSelected(null);
    setEditingFile(null);
    if (rootPath) refresh();
  }, [rootPath]);

  const handleToggle = useCallback(async (target: TreeNode) => {
    const toggle = async (nodes: TreeNode[]): Promise<TreeNode[]> => {
      return Promise.all(nodes.map(async n => {
        if (n.path === target.path) {
          if (n.type !== 'directory') return n;
          if (!n.loaded) {
            const children = await loadDir(n.path);
            return { ...n, expanded: true, loaded: true, children };
          }
          return { ...n, expanded: !n.expanded };
        }
        if (n.children) return { ...n, children: await toggle(n.children) };
        return n;
      }));
    };
    setTree(await toggle(tree));
  }, [tree, loadDir]);

  const handleSelect = useCallback((path: string, isFile: boolean) => {
    setSelected(path);
    if (isFile) setEditingFile(path);
  }, []);

  return (
    <div className="flex h-full flex-col overflow-hidden px-3 py-3">
      <div className="flex items-center justify-between rounded-[24px] border border-rose-100 bg-white/88 px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-950/80">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.24em] text-rose-400 dark:text-slate-500">Files</div>
          <div className="mt-1 text-sm font-semibold text-slate-700 dark:text-slate-200">文件浏览</div>
        </div>
        <button
          onClick={refresh}
          disabled={loading || !rootPath}
          className="flex h-10 w-10 items-center justify-center rounded-2xl text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-500 disabled:opacity-40 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
        </button>
      </div>

      <div className="mt-3 min-h-0 flex-1 overflow-y-auto rounded-[24px] border border-rose-100 bg-white/70 p-2 shadow-sm dark:border-slate-800 dark:bg-slate-950/65">
        {error && <div className="px-3 py-3 text-xs text-red-500">{error}</div>}
        {!rootPath && (
          <div className="mt-8 px-4 text-center text-sm text-slate-400 dark:text-slate-500">Select a project first</div>
        )}
        {rootPath && !loading && tree.length === 0 && !error && (
          <div className="mt-8 px-4 text-center text-sm text-slate-400 dark:text-slate-500">Empty directory</div>
        )}
        <div className="space-y-1">
          {tree.map(n => (
            <TreeRow key={n.path} node={n} depth={0} onToggle={handleToggle} selected={selected} onSelect={handleSelect} />
          ))}
        </div>
      </div>

      {editingFile && (
        <div className="min-h-0 flex-1" style={{ minHeight: 220 }}>
          <FileEditor path={editingFile} onClose={() => setEditingFile(null)} />
        </div>
      )}
    </div>
  );
}

