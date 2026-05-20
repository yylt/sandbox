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
  if (type === 'directory') return <Folder size={13} className="text-yellow-500 shrink-0" />;
  return <File size={13} className="text-gray-400 dark:text-slate-400 shrink-0" />;
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
          'flex items-center gap-1 px-2 py-0.5 cursor-pointer text-xs rounded transition-colors',
          selected === node.path
            ? 'bg-indigo-100 dark:bg-slate-700 text-indigo-700 dark:text-white'
            : 'text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700/60'
        )}
        style={{ paddingLeft: 8 + depth * 12 }}
      >
        {node.type === 'directory' ? (
          node.expanded
            ? <ChevronDown size={11} className="shrink-0 text-gray-400 dark:text-slate-500" />
            : <ChevronRight size={11} className="shrink-0 text-gray-400 dark:text-slate-500" />
        ) : (
          <span className="w-3 shrink-0" />
        )}
        {node.type === 'directory' && node.expanded
          ? <FolderOpen size={13} className="text-yellow-500 shrink-0" />
          : <FileIcon type={node.type} />
        }
        <span className="truncate">{node.name}</span>
        {node.size != null && node.type === 'file' && (
          <span className="ml-auto text-[10px] text-gray-400 dark:text-slate-600">{formatSize(node.size)}</span>
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
    <div className="flex flex-col h-full border-t border-gray-200 dark:border-slate-700">
      <div className="flex items-center justify-between px-3 py-1.5 bg-gray-50 dark:bg-[#0d1117] border-b border-gray-200 dark:border-slate-700 shrink-0">
        <span className="text-xs font-medium text-gray-700 dark:text-slate-300 truncate flex-1">{fileName}{dirty ? ' •' : ''}</span>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={save}
            disabled={saving || !dirty}
            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-400 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 disabled:opacity-40 transition-colors"
            title="Save (Ctrl+S)"
          >
            {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
          </button>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-400 dark:text-slate-400 hover:text-gray-700 dark:hover:text-white transition-colors"
          >
            <X size={12} />
          </button>
        </div>
      </div>
      {loading && (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 size={20} className="animate-spin text-indigo-500" />
        </div>
      )}
      {error && <div className="text-xs text-red-500 px-3 py-2">{error}</div>}
      {!loading && !error && (
        <textarea
          value={content}
          onChange={e => { setContent(e.target.value); setDirty(true); }}
          onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); save(); } }}
          className="flex-1 w-full p-2 text-xs font-mono bg-white dark:bg-[#0d1117] text-gray-800 dark:text-slate-200 outline-none resize-none border-none"
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
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-200 dark:border-slate-700">
        <span className="text-xs font-semibold text-gray-600 dark:text-slate-300">文件</span>
        <button
          onClick={refresh}
          disabled={loading || !rootPath}
          className="p-1 rounded hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-400 dark:text-slate-400 hover:text-gray-700 dark:hover:text-white transition-colors disabled:opacity-40"
        >
          {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto py-1 min-h-0">
        {error && <div className="text-xs text-red-500 px-3 py-2">{error}</div>}
        {!rootPath && (
          <div className="text-xs text-gray-400 dark:text-slate-600 text-center mt-6">Select a project first</div>
        )}
        {rootPath && !loading && tree.length === 0 && !error && (
          <div className="text-xs text-gray-400 dark:text-slate-600 text-center mt-6">Empty directory</div>
        )}
        {tree.map(n => (
          <TreeRow key={n.path} node={n} depth={0} onToggle={handleToggle} selected={selected} onSelect={handleSelect} />
        ))}
      </div>

      {editingFile && (
        <div className="flex-1 min-h-0 flex flex-col" style={{ minHeight: 200 }}>
          <FileEditor path={editingFile} onClose={() => setEditingFile(null)} />
        </div>
      )}
    </div>
  );
}

