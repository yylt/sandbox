import { useState, useCallback, useEffect, useRef } from 'react';
import { GitBranch, RefreshCw, Plus, Minus, FileEdit, AlertTriangle, Loader2, ChevronDown, X, GitCommit, ChevronRight } from 'lucide-react';
import { gitApi, filesApi } from '../api/client';
import { useAppStore } from '../store/AppContext';
import { cn } from '../lib/utils';
import type { GitStatusResponse, GitFileStatus, GitBranch as GitBranchType } from '../api/types';

const STATUS_ICON: Record<GitFileStatus['status'], React.ReactNode> = {
  modified: <FileEdit size={11} className="text-yellow-500" />,
  added: <Plus size={11} className="text-emerald-500" />,
  deleted: <Minus size={11} className="text-red-500" />,
  renamed: <FileEdit size={11} className="text-blue-500" />,
  untracked: <Plus size={11} className="text-gray-400 dark:text-slate-400" />,
  conflicted: <AlertTriangle size={11} className="text-red-500" />,
};

const STATUS_COLOR: Record<GitFileStatus['status'], string> = {
  modified: 'text-yellow-600 dark:text-yellow-400',
  added: 'text-emerald-600 dark:text-emerald-400',
  deleted: 'text-red-600 dark:text-red-400',
  renamed: 'text-blue-600 dark:text-blue-400',
  untracked: 'text-gray-500 dark:text-slate-400',
  conflicted: 'text-red-600 dark:text-red-500',
};

interface DiffSelection {
  filePath: string;
  staged: boolean;
}

function parseDiffToSideBySide(diff: string): { lineNo: number; before: string; after: string; type: 'add' | 'del' | 'ctx' | 'hunk' }[] {
  const lines = diff.split('\n');
  const result: { lineNo: number; before: string; after: string; type: 'add' | 'del' | 'ctx' | 'hunk' }[] = [];
  let i = 0;
  let lineNo = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith('@@')) {
      const m = line.match(/@@ -(\d+)/);
      if (m) lineNo = parseInt(m[1], 10);
      result.push({ lineNo: 0, before: line, after: line, type: 'hunk' });
      i++;
      continue;
    }
    if (line.startsWith('---') || line.startsWith('+++') || line.startsWith('diff') || line.startsWith('index')) {
      i++;
      continue;
    }
    if (line.startsWith('-')) {
      result.push({ lineNo: lineNo++, before: line.slice(1), after: '', type: 'del' });
    } else if (line.startsWith('+')) {
      if (result.length > 0 && result[result.length - 1].type === 'del' && result[result.length - 1].after === '') {
        result[result.length - 1].after = line.slice(1);
      } else {
        result.push({ lineNo: lineNo, before: '', after: line.slice(1), type: 'add' });
        lineNo++;
      }
    } else if (line !== '') {
      result.push({ lineNo: lineNo++, before: line.slice(1) || line, after: line.slice(1) || line, type: 'ctx' });
    }
    i++;
  }
  return result;
}

function SplitDiffPanel({
  repoPath, filePath, staged, onClose,
}: {
  repoPath: string; filePath: string; staged: boolean;
  onClose: () => void;
}) {
  const [diff, setDiff] = useState('');
  const [fileContent, setFileContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<'diff' | 'content'>('diff');

  useEffect(() => {
    setLoading(true);
    setDiff('');
    setFileContent('');
    setMode('diff');
    gitApi.diff(repoPath, filePath, staged)
      .then(r => {
        setDiff(r.diff);
        if (!r.diff) {
          // No diff — load file content instead
          const absPath = repoPath.replace(/\/$/, '') + '/' + filePath;
          return filesApi.readContent(absPath).then(fc => {
            const content = fc.encoding === 'base64' ? atob(fc.content) : fc.content;
            setFileContent(content);
            setMode('content');
          }).catch(() => {});
        }
      })
      .catch(() => setDiff(''))
      .finally(() => setLoading(false));
  }, [repoPath, filePath, staged]);

  const rows = mode === 'diff' ? parseDiffToSideBySide(diff) : [];

  return (
    <div className="flex flex-col border-t border-gray-200 dark:border-slate-700 bg-white dark:bg-[#0d1117]" style={{ height: 280 }}>
      {/* Header */}
      <div className="flex items-center justify-between px-2 py-1 border-b border-gray-200 dark:border-slate-700 shrink-0 bg-gray-50 dark:bg-[#161b22]">
        <span className="text-[11px] font-medium text-gray-600 dark:text-slate-300 truncate flex-1">
          {filePath.split('/').pop()}
          <span className="ml-1.5 text-[9px] opacity-50">
            {mode === 'content' ? '文件内容' : staged ? '已暂存' : '未暂存'}
          </span>
        </span>
        <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-400 hover:text-gray-700 dark:hover:text-white transition-colors ml-1 shrink-0">
          <X size={11} />
        </button>
      </div>
      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center flex-1"><Loader2 size={14} className="animate-spin text-indigo-500" /></div>
      ) : mode === 'content' ? (
        <div className="flex-1 overflow-auto">
          <pre className="text-[10px] font-mono leading-relaxed p-2 text-gray-700 dark:text-slate-300 whitespace-pre">
            {fileContent || '（空文件）'}
          </pre>
        </div>
      ) : diff === '' ? (
        <div className="text-[10px] text-gray-400 dark:text-slate-500 text-center py-4">无差异</div>
      ) : (
        <div className="flex flex-1 overflow-auto min-h-0">
          {/* Before */}
          <div className="flex-1 border-r border-gray-100 dark:border-slate-800 overflow-auto min-w-0">
            <div className="text-[9px] font-semibold text-gray-400 dark:text-slate-500 px-2 py-0.5 bg-gray-50 dark:bg-[#161b22] border-b border-gray-100 dark:border-slate-800 sticky top-0">修改前</div>
            <pre className="text-[10px] font-mono leading-relaxed p-1">
              {rows.map((r, i) => (
                <div
                  key={i}
                  className={cn(
                    'flex',
                    r.type === 'del' ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400' :
                    r.type === 'hunk' ? 'text-blue-500 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-900/10' :
                    'text-gray-700 dark:text-slate-400'
                  )}
                >
                  <span className="select-none text-[9px] text-gray-300 dark:text-slate-600 w-6 shrink-0 text-right pr-1">{r.type !== 'hunk' && r.type !== 'add' ? r.lineNo : ''}</span>
                  <span className="whitespace-pre">{r.type === 'hunk' ? r.before : r.before || '\u00a0'}</span>
                </div>
              ))}
            </pre>
          </div>
          {/* After */}
          <div className="flex-1 overflow-auto min-w-0">
            <div className="text-[9px] font-semibold text-gray-400 dark:text-slate-500 px-2 py-0.5 bg-gray-50 dark:bg-[#161b22] border-b border-gray-100 dark:border-slate-800 sticky top-0">修改后</div>
            <pre className="text-[10px] font-mono leading-relaxed p-1">
              {rows.map((r, i) => (
                <div
                  key={i}
                  className={cn(
                    'flex',
                    r.type === 'add' ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400' :
                    r.type === 'del' && r.after ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400' :
                    r.type === 'hunk' ? 'text-blue-500 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-900/10' :
                    'text-gray-700 dark:text-slate-400'
                  )}
                >
                  <span className="select-none text-[9px] text-gray-300 dark:text-slate-600 w-6 shrink-0 text-right pr-1">{r.type !== 'hunk' && r.type !== 'del' ? r.lineNo : r.type === 'del' && r.after ? r.lineNo : ''}</span>
                  <span className="whitespace-pre">{r.type === 'hunk' ? r.after : (r.after || (r.type === 'del' ? '\u00a0' : r.before || '\u00a0'))}</span>
                </div>
              ))}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

function FileRow({
  f, repoPath, staged, selected, onSelect, onStage,
}: {
  f: GitFileStatus; repoPath: string; staged: boolean;
  selected: boolean; onSelect: () => void; onStage?: () => void;
}) {
  return (
    <div
      onClick={onSelect}
      className={cn(
        'flex items-center gap-1.5 px-2 py-0.5 rounded text-xs cursor-pointer group',
        selected
          ? 'bg-indigo-50 dark:bg-indigo-900/30'
          : 'hover:bg-gray-50 dark:hover:bg-slate-700/40'
      )}
    >
      {/* Stage button (only for unstaged/untracked) */}
      {!staged && onStage && (
        <button
          onClick={e => { e.stopPropagation(); onStage(); }}
          title="暂存此文件"
          className="p-0.5 rounded hover:bg-emerald-100 dark:hover:bg-emerald-900/40 text-gray-300 dark:text-slate-600 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors shrink-0 opacity-0 group-hover:opacity-100"
        >
          <Plus size={11} />
        </button>
      )}
      {staged && <span className="w-4 shrink-0" />}
      {STATUS_ICON[f.status]}
      <span className={cn('truncate flex-1', STATUS_COLOR[f.status])}>{f.path}</span>
      <ChevronRight size={9} className={cn('shrink-0 text-gray-300 dark:text-slate-600 transition-transform', selected && 'rotate-90')} />
    </div>
  );
}

function Section({
  title, files, repoPath, staged, selectedFile, onSelectFile, onStage,
}: {
  title: string; files: GitFileStatus[]; repoPath: string; staged: boolean;
  selectedFile: DiffSelection | null;
  onSelectFile: (sel: DiffSelection | null) => void;
  onStage?: (path: string) => void;
}) {
  const [open, setOpen] = useState(true);
  if (files.length === 0) return null;
  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1 w-full px-3 py-1 text-[10px] uppercase tracking-wider text-gray-500 dark:text-slate-500 hover:text-gray-700 dark:hover:text-slate-300 transition-colors"
      >
        <ChevronDown size={10} className={cn('transition-transform', !open && '-rotate-90')} />
        {title} <span className="ml-1 bg-gray-100 dark:bg-slate-700 rounded px-1">{files.length}</span>
      </button>
      {open && files.map(f => (
        <FileRow
          key={f.path + f.status}
          f={f}
          repoPath={repoPath}
          staged={staged}
          selected={selectedFile?.filePath === f.path && selectedFile?.staged === staged}
          onSelect={() => {
            if (selectedFile?.filePath === f.path && selectedFile?.staged === staged) {
              onSelectFile(null);
            } else {
              onSelectFile({ filePath: f.path, staged });
            }
          }}
          onStage={onStage ? () => onStage(f.path) : undefined}
        />
      ))}
    </div>
  );
}

function BranchSection({ repoPath }: { repoPath: string }) {
  const [open, setOpen] = useState(false);
  const [branches, setBranches] = useState<GitBranchType[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!repoPath) return;
    setLoading(true);
    try {
      const res = await gitApi.branches(repoPath);
      setBranches(res.branches);
    } catch {}
    setLoading(false);
  }, [repoPath]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  return (
    <div className="border-b border-gray-200 dark:border-slate-700">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1 w-full px-3 py-1.5 text-[10px] uppercase tracking-wider text-gray-500 dark:text-slate-500 hover:text-gray-700 dark:hover:text-slate-300 transition-colors"
      >
        <ChevronDown size={10} className={cn('transition-transform', !open && '-rotate-90')} />
        <GitBranch size={10} className="mr-0.5" />
        分支列表
      </button>
      {open && (
        <div className="pb-1">
          {loading && <div className="flex justify-center py-2"><Loader2 size={12} className="animate-spin text-indigo-500" /></div>}
          {branches.map(b => (
            <div key={b.name} className={cn(
              'flex items-center gap-2 px-4 py-0.5 text-xs',
              b.current ? 'text-indigo-600 dark:text-indigo-400 font-semibold' : 'text-gray-600 dark:text-slate-400'
            )}>
              <GitBranch size={10} className="shrink-0" />
              <span className="truncate">{b.name}</span>
              {b.current && <span className="ml-auto text-[9px] bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 px-1 rounded">当前</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CommitLogSection({ repoPath }: { repoPath: string }) {
  const [open, setOpen] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !repoPath) return;
    setLoading(true);
    gitApi.diff(repoPath).then(r => {
      setLog(r.diff ? ['(diff loaded — commit log not yet supported by API)'] : ['No diff']);
    }).catch(() => setLog(['Failed to load'])).finally(() => setLoading(false));
  }, [open, repoPath]);

  return (
    <div className="border-b border-gray-200 dark:border-slate-700">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1 w-full px-3 py-1.5 text-[10px] uppercase tracking-wider text-gray-500 dark:text-slate-500 hover:text-gray-700 dark:hover:text-slate-300 transition-colors"
      >
        <ChevronDown size={10} className={cn('transition-transform', !open && '-rotate-90')} />
        <GitCommit size={10} className="mr-0.5" />
        提交记录
      </button>
      {open && (
        <div className="pb-1">
          {loading && <div className="flex justify-center py-2"><Loader2 size={12} className="animate-spin text-indigo-500" /></div>}
          {log.map((l, i) => (
            <div key={i} className="px-4 py-0.5 text-[10px] text-gray-500 dark:text-slate-500 font-mono truncate">{l}</div>
          ))}
        </div>
      )}
    </div>
  );
}

export function GitPanel() {
  const { activeProject } = useAppStore();
  const [status, setStatus] = useState<GitStatusResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [commitMsg, setCommitMsg] = useState('');
  const [committing, setCommitting] = useState(false);
  const [selectedDiff, setSelectedDiff] = useState<DiffSelection | null>(null);
  const repoPath = activeProject?.rootPath ?? '';

  const refresh = useCallback(async () => {
    if (!repoPath) return;
    setLoading(true);
    setError(null);
    try {
      const s = await gitApi.status(repoPath);
      setStatus(s);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setLoading(false);
    }
  }, [repoPath]);

  useEffect(() => {
    setStatus(null);
    setError(null);
    setSelectedDiff(null);
    if (repoPath) refresh();
  }, [repoPath]);

  const handleCommit = async () => {
    if (!commitMsg.trim() || !repoPath) return;
    setCommitting(true);
    try {
      await gitApi.commit({ repoPath, message: commitMsg.trim() });
      setCommitMsg('');
      await refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Commit failed');
    } finally {
      setCommitting(false);
    }
  };

  const handleStage = async (path: string) => {
    if (!repoPath) return;
    try {
      await gitApi.stage(repoPath, path);
      await refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Stage failed');
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* File list */}
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
        {/* Branch info header */}
        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-gray-200 dark:border-slate-700 shrink-0">
          {status && (
            <>
              <GitBranch size={12} className="text-indigo-500" />
              <span className="text-xs text-gray-700 dark:text-slate-300 font-medium truncate">{status.branch}</span>
              {status.ahead != null && status.ahead > 0 && (
                <span className="text-[9px] text-blue-500 shrink-0">↑{status.ahead}</span>
              )}
              {status.behind != null && status.behind > 0 && (
                <span className="text-[9px] text-orange-500 shrink-0">↓{status.behind}</span>
              )}
              {!status.clean && <span className="ml-auto text-[10px] bg-yellow-100 dark:bg-yellow-900/40 text-yellow-600 dark:text-yellow-400 px-1.5 rounded shrink-0">dirty</span>}
              {status.clean && <span className="ml-auto text-[10px] bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 px-1.5 rounded shrink-0">clean</span>}
            </>
          )}
          {!status && !loading && (
            <span className="text-xs text-gray-400 dark:text-slate-500">{repoPath ? 'Click refresh' : 'No project'}</span>
          )}
          <button
            onClick={refresh}
            disabled={loading || !repoPath}
            className="ml-auto p-1 rounded hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-400 dark:text-slate-400 hover:text-gray-700 dark:hover:text-white transition-colors disabled:opacity-40 shrink-0"
          >
            {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0">
          {repoPath && <BranchSection repoPath={repoPath} />}
          {repoPath && <CommitLogSection repoPath={repoPath} />}

          {error && <div className="text-xs text-red-500 px-3 py-2">{error}</div>}

          {status && (
            <>
              <Section
                title="已暂存"
                files={status.staged}
                repoPath={repoPath}
                staged={true}
                selectedFile={selectedDiff}
                onSelectFile={setSelectedDiff}
              />
              <Section
                title="变更"
                files={status.unstaged}
                repoPath={repoPath}
                staged={false}
                selectedFile={selectedDiff}
                onSelectFile={setSelectedDiff}
                onStage={handleStage}
              />
              {status.untracked.length > 0 && (
                <Section
                  title="未跟踪"
                  files={status.untracked.map(p => ({ path: p, status: 'untracked' as const }))}
                  repoPath={repoPath}
                  staged={false}
                  selectedFile={selectedDiff}
                  onSelectFile={setSelectedDiff}
                  onStage={handleStage}
                />
              )}
              {status.clean && (
                <div className="text-xs text-gray-400 dark:text-slate-600 text-center py-4 px-3">无变更</div>
              )}
            </>
          )}
        </div>

        {status && !status.clean && (
          <div className="px-2 pb-2 pt-1 border-t border-gray-200 dark:border-slate-700 shrink-0">
            <textarea
              value={commitMsg}
              onChange={e => setCommitMsg(e.target.value)}
              placeholder="提交信息..."
              rows={2}
              className="w-full text-xs bg-gray-50 dark:bg-slate-700 text-gray-800 dark:text-slate-200 placeholder-gray-400 dark:placeholder-slate-500 rounded px-2 py-1.5 outline-none resize-none border border-gray-200 dark:border-slate-600 focus:border-indigo-400 dark:focus:border-indigo-500 transition-colors"
            />
            <button
              onClick={handleCommit}
              disabled={!commitMsg.trim() || committing}
              className="mt-1 w-full text-xs bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-200 dark:disabled:bg-slate-700 disabled:cursor-not-allowed disabled:text-gray-400 dark:disabled:text-slate-500 text-white rounded py-1.5 transition-colors flex items-center justify-center gap-1"
            >
              {committing ? <Loader2 size={12} className="animate-spin" /> : null}
              提交
            </button>
          </div>
        )}
      </div>

      {/* Diff panel — shown below file list when a file is selected */}
      {selectedDiff && (
        <SplitDiffPanel
          repoPath={repoPath}
          filePath={selectedDiff.filePath}
          staged={selectedDiff.staged}
          onClose={() => setSelectedDiff(null)}
        />
      )}
    </div>
  );
}
