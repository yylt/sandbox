import { useState, useCallback, useEffect } from 'react';
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
  untracked: <Plus size={11} className="text-slate-400 dark:text-slate-400" />,
  conflicted: <AlertTriangle size={11} className="text-red-500" />,
};

const STATUS_COLOR: Record<GitFileStatus['status'], string> = {
  modified: 'text-yellow-600 dark:text-yellow-400',
  added: 'text-emerald-600 dark:text-emerald-400',
  deleted: 'text-red-600 dark:text-red-400',
  renamed: 'text-blue-600 dark:text-blue-400',
  untracked: 'text-slate-500 dark:text-slate-400',
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
    <div className="mt-3 flex flex-col overflow-hidden rounded-[24px] border border-rose-100 bg-white/92 shadow-[0_16px_40px_rgba(15,23,42,0.08)] dark:border-slate-800 dark:bg-slate-950/88" style={{ height: 300 }}>
      <div className="flex shrink-0 items-center justify-between border-b border-rose-100 bg-white/90 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/80">
        <span className="flex-1 truncate text-[11px] font-semibold text-slate-700 dark:text-slate-200">
          {filePath.split('/').pop()}
          <span className="ml-1.5 text-[10px] opacity-50">
            {mode === 'content' ? '文件内容' : staged ? '已暂存' : '未暂存'}
          </span>
        </span>
        <button onClick={onClose} className="ml-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-rose-50 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white">
          <X size={12} />
        </button>
      </div>
      {loading ? (
        <div className="flex flex-1 items-center justify-center"><Loader2 size={15} className="animate-spin text-rose-500 dark:text-indigo-400" /></div>
      ) : mode === 'content' ? (
        <div className="flex-1 overflow-auto">
          <pre className="p-3 text-[10px] leading-relaxed whitespace-pre text-slate-700 dark:text-slate-300 font-mono">
            {fileContent || '（空文件）'}
          </pre>
        </div>
      ) : diff === '' ? (
        <div className="py-5 text-center text-[11px] text-slate-400 dark:text-slate-500">无差异</div>
      ) : (
        <div className="flex min-h-0 flex-1 overflow-auto">
          <div className="min-w-0 flex-1 overflow-auto border-r border-rose-100 dark:border-slate-800">
            <div className="sticky top-0 border-b border-rose-100 bg-rose-50/80 px-2 py-1 text-[9px] font-semibold text-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-500">修改前</div>
            <pre className="p-1 text-[10px] leading-relaxed font-mono">
              {rows.map((r, i) => (
                <div
                  key={i}
                  className={cn(
                    'flex',
                    r.type === 'del' ? 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400' :
                    r.type === 'hunk' ? 'bg-blue-50/50 text-blue-500 dark:bg-blue-900/10 dark:text-blue-400' :
                    'text-slate-700 dark:text-slate-400'
                  )}
                >
                  <span className="w-6 shrink-0 select-none pr-1 text-right text-[9px] text-slate-300 dark:text-slate-600">{r.type !== 'hunk' && r.type !== 'add' ? r.lineNo : ''}</span>
                  <span className="whitespace-pre">{r.type === 'hunk' ? r.before : r.before || '\u00a0'}</span>
                </div>
              ))}
            </pre>
          </div>
          <div className="min-w-0 flex-1 overflow-auto">
            <div className="sticky top-0 border-b border-rose-100 bg-emerald-50/70 px-2 py-1 text-[9px] font-semibold text-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-500">修改后</div>
            <pre className="p-1 text-[10px] leading-relaxed font-mono">
              {rows.map((r, i) => (
                <div
                  key={i}
                  className={cn(
                    'flex',
                    r.type === 'add' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400' :
                    r.type === 'del' && r.after ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400' :
                    r.type === 'hunk' ? 'bg-blue-50/50 text-blue-500 dark:bg-blue-900/10 dark:text-blue-400' :
                    'text-slate-700 dark:text-slate-400'
                  )}
                >
                  <span className="w-6 shrink-0 select-none pr-1 text-right text-[9px] text-slate-300 dark:text-slate-600">{r.type !== 'hunk' && r.type !== 'del' ? r.lineNo : r.type === 'del' && r.after ? r.lineNo : ''}</span>
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
  f, staged, selected, onSelect, onStage,
}: {
  f: GitFileStatus; repoPath: string; staged: boolean;
  selected: boolean; onSelect: () => void; onStage?: () => void;
}) {
  return (
    <div
      onClick={onSelect}
      className={cn(
        'group flex cursor-pointer items-center gap-2 rounded-2xl px-3 py-2 text-sm',
        selected
          ? 'bg-white shadow-sm ring-1 ring-rose-100 dark:bg-slate-900 dark:ring-slate-700'
          : 'hover:bg-rose-50/90 dark:hover:bg-slate-900'
      )}
    >
      {!staged && onStage && (
        <button
          onClick={e => { e.stopPropagation(); onStage(); }}
          title="暂存此文件"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-slate-300 opacity-0 transition-all hover:bg-emerald-100 hover:text-emerald-600 group-hover:opacity-100 dark:text-slate-600 dark:hover:bg-emerald-900/40 dark:hover:text-emerald-400"
        >
          <Plus size={11} />
        </button>
      )}
      {staged && <span className="w-6 shrink-0" />}
      {STATUS_ICON[f.status]}
      <span className={cn('flex-1 truncate', STATUS_COLOR[f.status])}>{f.path}</span>
      <ChevronRight size={10} className={cn('shrink-0 text-slate-300 transition-transform dark:text-slate-600', selected && 'rotate-90')} />
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
    <div className="mt-3 rounded-[22px] border border-rose-100 bg-white/70 p-2 dark:border-slate-800 dark:bg-slate-950/60">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center gap-1 px-2 py-1 text-[10px] uppercase tracking-[0.24em] text-slate-500 transition-colors hover:text-slate-700 dark:text-slate-500 dark:hover:text-slate-300"
      >
        <ChevronDown size={10} className={cn('transition-transform', !open && '-rotate-90')} />
        {title} <span className="ml-1 rounded-full bg-rose-100 px-1.5 py-0.5 tracking-normal text-rose-600 dark:bg-slate-800 dark:text-slate-300">{files.length}</span>
      </button>
      {open && (
        <div className="mt-1 space-y-1">
          {files.map(f => (
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
      )}
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
    <div className="mt-3 rounded-[22px] border border-rose-100 bg-white/70 p-2 dark:border-slate-800 dark:bg-slate-950/60">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center gap-1 px-2 py-1 text-[10px] uppercase tracking-[0.24em] text-slate-500 transition-colors hover:text-slate-700 dark:text-slate-500 dark:hover:text-slate-300"
      >
        <ChevronDown size={10} className={cn('transition-transform', !open && '-rotate-90')} />
        <GitBranch size={10} className="mr-0.5" />
        分支列表
      </button>
      {open && (
        <div className="mt-1 space-y-1 pb-1">
          {loading && <div className="flex justify-center py-3"><Loader2 size={12} className="animate-spin text-rose-500 dark:text-indigo-400" /></div>}
          {branches.map(b => (
            <div key={b.name} className={cn(
              'flex items-center gap-2 rounded-2xl px-3 py-2 text-sm',
              b.current ? 'bg-white text-rose-600 shadow-sm dark:bg-slate-900 dark:text-indigo-300' : 'text-slate-600 dark:text-slate-400'
            )}>
              <GitBranch size={11} className="shrink-0" />
              <span className="truncate">{b.name}</span>
              {b.current && <span className="ml-auto rounded-full bg-rose-100 px-2 py-0.5 text-[10px] text-rose-600 dark:bg-indigo-900/40 dark:text-indigo-300">当前</span>}
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
    <div className="mt-3 rounded-[22px] border border-rose-100 bg-white/70 p-2 dark:border-slate-800 dark:bg-slate-950/60">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center gap-1 px-2 py-1 text-[10px] uppercase tracking-[0.24em] text-slate-500 transition-colors hover:text-slate-700 dark:text-slate-500 dark:hover:text-slate-300"
      >
        <ChevronDown size={10} className={cn('transition-transform', !open && '-rotate-90')} />
        <GitCommit size={10} className="mr-0.5" />
        提交记录
      </button>
      {open && (
        <div className="mt-1 space-y-1 pb-1">
          {loading && <div className="flex justify-center py-3"><Loader2 size={12} className="animate-spin text-rose-500 dark:text-indigo-400" /></div>}
          {log.map((l, i) => (
            <div key={i} className="rounded-2xl px-3 py-2 text-[11px] text-slate-500 dark:text-slate-500 font-mono">{l}</div>
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
    <div className="flex h-full flex-col overflow-hidden px-3 py-3">
      <div className="flex items-center gap-3 rounded-[24px] border border-rose-100 bg-white/88 px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-950/80">
        {status ? (
          <>
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-rose-100 text-rose-500 dark:bg-indigo-900/40 dark:text-indigo-300">
              <GitBranch size={15} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-slate-700 dark:text-slate-200">{status.branch}</div>
              <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-400 dark:text-slate-500">
                {status.ahead != null && status.ahead > 0 && <span>↑{status.ahead}</span>}
                {status.behind != null && status.behind > 0 && <span>↓{status.behind}</span>}
                <span className={cn('rounded-full px-2 py-0.5', status.clean ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300')}>
                  {status.clean ? 'clean' : 'dirty'}
                </span>
              </div>
            </div>
          </>
        ) : (
          <div className="min-w-0 flex-1 text-sm text-slate-400 dark:text-slate-500">{repoPath ? 'Click refresh' : 'No project'}</div>
        )}
        <button
          onClick={refresh}
          disabled={loading || !repoPath}
          className="ml-auto flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-500 disabled:opacity-40 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
        </button>
      </div>

      <div className="mt-3 min-h-0 flex-1 overflow-y-auto rounded-[24px] border border-rose-100 bg-white/70 p-3 shadow-sm dark:border-slate-800 dark:bg-slate-950/65">
        {repoPath && <BranchSection repoPath={repoPath} />}
        {repoPath && <CommitLogSection repoPath={repoPath} />}

        {error && <div className="mt-3 rounded-2xl bg-red-50 px-4 py-3 text-xs text-red-500 dark:bg-red-900/20">{error}</div>}

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
              <div className="px-4 py-10 text-center text-sm text-slate-400 dark:text-slate-500">无变更</div>
            )}
          </>
        )}
      </div>

      {status && !status.clean && (
        <div className="mt-3 rounded-[24px] border border-rose-100 bg-white/88 p-3 shadow-sm dark:border-slate-800 dark:bg-slate-950/80">
          <textarea
            value={commitMsg}
            onChange={e => setCommitMsg(e.target.value)}
            placeholder="提交信息..."
            rows={2}
            className="w-full resize-none rounded-2xl border border-rose-100 bg-rose-50/60 px-3 py-2 text-sm text-slate-700 outline-none transition-colors placeholder:text-slate-400 focus:border-rose-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:placeholder:text-slate-500 dark:focus:border-indigo-500"
          />
          <button
            onClick={handleCommit}
            disabled={!commitMsg.trim() || committing}
            className="mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-rose-500 to-fuchsia-500 text-sm font-medium text-white transition-all hover:-translate-y-px hover:from-rose-400 hover:to-fuchsia-400 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:bg-none dark:disabled:bg-slate-700 dark:disabled:text-slate-500"
          >
            {committing ? <Loader2 size={13} className="animate-spin" /> : null}
            提交
          </button>
        </div>
      )}

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
