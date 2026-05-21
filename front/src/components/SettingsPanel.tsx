import { useMemo, useState } from 'react';
import { X, Sun, Moon, Plus, Trash2, ChevronDown, Edit2, Check } from 'lucide-react';
import { configApi } from '../api/client';
import { useAppStore } from '../store/AppContext';
import { cn } from '../lib/utils';
import type { AgentModeConfig, SlashCommand, Skill, McpServer, InstallableItem, FontScale } from '../store/AppContext';

const FONT_SCALE_OPTIONS: Array<{ id: FontScale; label: string; desc: string }> = [
  { id: 'compact', label: '紧凑', desc: '更高信息密度' },
  { id: 'standard', label: '标准', desc: '平衡阅读与密度' },
  { id: 'comfortable', label: '舒适', desc: '更大字号，更易读' },
];

interface Props {
  onClose: () => void;
}

function SectionHeader({ title, open, onToggle, onAdd }: { title: string; open: boolean; onToggle: () => void; onAdd?: () => void }) {
  return (
        <div className="mb-2 flex items-center gap-2">

      <button
        onClick={onToggle}
        className="flex flex-1 items-center gap-1 text-xs font-semibold uppercase tracking-[0.24em] text-slate-500 transition-colors hover:text-slate-700 dark:hover:text-slate-200"
      >
        <ChevronDown size={12} className={cn('transition-transform', !open && '-rotate-90')} />
        {title}
      </button>
      {onAdd && (
        <button
          onClick={onAdd}
            className="flex h-8 w-8 items-center justify-center rounded-xl bg-white text-slate-400 transition-colors hover:bg-slate-50 hover:text-sky-700 dark:bg-slate-900 dark:hover:bg-slate-800 dark:hover:text-cyan-200"

        >
          <Plus size={11} />
        </button>
      )}
    </div>
  );
}

function PromptEditor({
  title,
  value,
  onChange,
  onCancel,
  onSave,
}: {
  title: string;
  value: string;
  onChange: (value: string) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <div className="space-y-2">
      <div className="text-[11px] font-medium text-slate-500">{title}</div>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        rows={4}
        className="w-full resize-none rounded-2xl border border-cyan-400/14 bg-slate-950 px-3 py-2 text-xs text-slate-200 outline-none focus:border-cyan-300/30"
      />
      <div className="flex gap-2">
        <button onClick={onCancel} className="flex-1 rounded-xl bg-slate-100 py-2 text-xs text-slate-600 transition-colors hover:bg-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800">取消</button>
        <button onClick={onSave} className="flex flex-1 items-center justify-center gap-1 rounded-xl border border-sky-200 bg-[linear-gradient(135deg,rgba(96,165,250,0.94),rgba(129,140,248,0.9))] py-2 text-xs text-white transition-all hover:-translate-y-px hover:brightness-105 dark:border-cyan-300/20 dark:bg-[linear-gradient(135deg,rgba(14,165,233,0.98),rgba(99,102,241,0.96))] dark:hover:brightness-110"><Check size={10} />保存</button>
      </div>
    </div>
  );
}

function ModeItem({ mode, active, onSelect, onDelete, onSave }: {
  mode: AgentModeConfig;
  active: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onSave: (updated: AgentModeConfig) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draftDesc, setDraftDesc] = useState(mode.desc);
  const [draftPrompt, setDraftPrompt] = useState(mode.prompt);

  const save = () => {
    onSave({ ...mode, desc: draftDesc, prompt: draftPrompt });
    setEditing(false);
  };

  const cancel = () => {
    setDraftDesc(mode.desc);
    setDraftPrompt(mode.prompt);
    setEditing(false);
  };

  return (
    <div className={cn(
      'rounded-[24px] border p-3 transition-colors',
      active ? 'border-sky-200 bg-white shadow-[0_10px_28px_rgba(148,163,184,0.14)] dark:border-cyan-300/26 dark:bg-slate-950 dark:shadow-[0_10px_28px_rgba(2,6,23,0.28)]' : 'border-slate-200 bg-white/76 dark:border-cyan-400/14 dark:bg-slate-950/80'
    )}>
      {editing ? (
        <div className="space-y-1.5">
          <div className="text-[11px] font-medium text-slate-500">{mode.label} — 描述</div>
          <input
            value={draftDesc}
            onChange={e => setDraftDesc(e.target.value)}
            placeholder="描述"
            className="w-full rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 outline-none focus:border-sky-200 dark:border-cyan-400/14 dark:bg-slate-950 dark:text-slate-200 dark:focus:border-cyan-300/30"
          />
          <div className="pt-0.5 text-[11px] font-medium text-slate-500">提示词</div>
          <textarea
            value={draftPrompt}
            onChange={e => setDraftPrompt(e.target.value)}
            rows={4}
            className="w-full resize-none rounded border border-cyan-400/14 bg-slate-950 px-2 py-1 text-xs text-slate-200 outline-none focus:border-cyan-300/30"
          />
          <div className="flex gap-1.5">
             <button onClick={cancel} className="flex-1 rounded bg-slate-100 py-1 text-xs text-slate-600 transition-colors hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700">取消</button>
             <button onClick={save} className="flex flex-1 items-center justify-center gap-1 rounded bg-sky-500 py-1 text-xs text-white transition-colors hover:bg-sky-400 dark:bg-cyan-500 dark:text-slate-950 dark:hover:bg-cyan-400"><Check size={10} />保存</button>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-2">
          <button onClick={onSelect} className="flex items-center gap-2 flex-1 text-left min-w-0">
            <div className="min-w-0">
              <div className="text-xs font-semibold text-slate-700 dark:text-slate-200">{mode.label}{mode.desc ? `(${mode.desc})` : ''}</div>
              {mode.source && <div className="mt-0.5 truncate text-[9px] text-sky-500 dark:text-sky-400">{mode.source}</div>}
            </div>
            {active && <span className="ml-auto shrink-0 rounded border border-sky-200 bg-sky-50 px-1 text-[9px] text-sky-700 dark:border-cyan-300/24 dark:bg-cyan-400/10 dark:text-cyan-200">当前</span>}
          </button>
          <button onClick={() => setEditing(true)} className="shrink-0 rounded p-1 text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-700 dark:text-slate-500 dark:hover:bg-slate-900 dark:hover:text-slate-200">
            <Edit2 size={10} />
          </button>
          <button onClick={onDelete} className="shrink-0 rounded p-1 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:text-slate-500 dark:hover:bg-red-500/15 dark:hover:text-red-300">
            <Trash2 size={10} />
          </button>
        </div>
      )}
    </div>
  );
}

function SlashCommandItem({ cmd, onDelete, onSave }: {
  cmd: SlashCommand;
  onDelete: () => void;
  onSave: (updated: SlashCommand) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draftDesc, setDraftDesc] = useState(cmd.desc ?? '');
  const [draftPrompt, setDraftPrompt] = useState(cmd.prompt);

  const save = () => {
    onSave({ ...cmd, desc: draftDesc, prompt: draftPrompt });
    setEditing(false);
  };

  const cancel = () => {
    setDraftDesc(cmd.desc ?? '');
    setDraftPrompt(cmd.prompt);
    setEditing(false);
  };

  return (
    <div className="rounded-[24px] border border-slate-200 bg-white/76 p-3 dark:border-cyan-400/14 dark:bg-slate-950/80">
      {editing ? (
        <div className="space-y-1.5">
          <div className="text-[11px] font-medium text-slate-500">/{cmd.name} — 描述</div>
          <input
            value={draftDesc}
            onChange={e => setDraftDesc(e.target.value)}
            placeholder="描述（显示在 / 弹出列表中）"
            className="w-full rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 outline-none focus:border-sky-200 dark:border-cyan-400/14 dark:bg-slate-950 dark:text-slate-200 dark:focus:border-cyan-300/30"
          />
          <div className="pt-0.5 text-[11px] font-medium text-slate-500">提示词</div>
          <textarea
            value={draftPrompt}
            onChange={e => setDraftPrompt(e.target.value)}
            placeholder="提示词模板，用 {% ARGUMENT %} 表示参数"
            rows={3}
            className="w-full resize-none rounded border border-cyan-400/14 bg-slate-950 px-2 py-1 text-xs text-slate-200 outline-none focus:border-cyan-300/30"
          />
          <div className="flex gap-1.5">
             <button onClick={cancel} className="flex-1 rounded bg-slate-100 py-1 text-xs text-slate-600 transition-colors hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700">取消</button>
             <button onClick={save} className="flex flex-1 items-center justify-center gap-1 rounded bg-sky-500 py-1 text-xs text-white transition-colors hover:bg-sky-400 dark:bg-cyan-500 dark:text-slate-950 dark:hover:bg-cyan-400"><Check size={10} />保存</button>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <div className="text-xs font-mono font-semibold text-sky-700 dark:text-cyan-300">/{cmd.name}</div>
            {cmd.desc && <div className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400">{cmd.desc}</div>}
            {cmd.source && <div className="mt-0.5 truncate text-[9px] text-sky-500 dark:text-sky-400">{cmd.source}</div>}
            <div className="mt-0.5 truncate text-[10px] text-slate-400 dark:text-slate-500">{cmd.prompt}</div>
          </div>
          <button onClick={() => setEditing(true)} className="shrink-0 rounded p-1 text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-700 dark:text-slate-500 dark:hover:bg-slate-900 dark:hover:text-slate-200">
            <Edit2 size={10} />
          </button>
          <button onClick={onDelete} className="shrink-0 rounded p-1 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:text-slate-500 dark:hover:bg-red-500/15 dark:hover:text-red-300">
            <Trash2 size={10} />
          </button>
        </div>
      )}
    </div>
  );
}

function SkillItem({ skill, onDelete, onSave }: {
  skill: Skill;
  onDelete: () => void;
  onSave: (updated: Skill) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draftPrompt, setDraftPrompt] = useState(skill.prompt);

  const save = () => {
    onSave({ ...skill, prompt: draftPrompt });
    setEditing(false);
  };

  return (
    <div className="rounded-[24px] border border-slate-200 bg-white/76 p-3 dark:border-cyan-400/14 dark:bg-slate-950/80">
      {editing ? (
        <PromptEditor
          title={`${skill.name} 提示词`}
          value={draftPrompt}
          onChange={setDraftPrompt}
          onCancel={() => { setEditing(false); setDraftPrompt(skill.prompt); }}
          onSave={save}
        />
      ) : (
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-slate-700 dark:text-slate-200">{skill.name}</div>
            <div className="mt-0.5 text-[10px] text-slate-400 dark:text-slate-500">{skill.desc}</div>
            {skill.source && <div className="mt-0.5 truncate text-[9px] text-sky-500 dark:text-sky-400">{skill.source}</div>}
          </div>
          <button onClick={() => setEditing(true)} className="shrink-0 rounded p-1 text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-700 dark:text-slate-500 dark:hover:bg-slate-900 dark:hover:text-slate-200">
            <Edit2 size={10} />
          </button>
          <button onClick={onDelete} className="shrink-0 rounded p-1 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:text-slate-500 dark:hover:bg-red-500/15 dark:hover:text-red-300">
            <Trash2 size={10} />
          </button>
        </div>
      )}
    </div>
  );
}

function McpItem({ server, onDelete, onSave }: {
  server: McpServer;
  onDelete: () => void;
  onSave: (updated: McpServer) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(server);

  const save = () => { onSave(draft); setEditing(false); };

  return (
    <div className="rounded-[24px] border border-slate-200 bg-white/76 p-3 dark:border-cyan-400/14 dark:bg-slate-950/80">
      {editing ? (
        <div className="space-y-1.5">
          <input
            value={draft.name}
            onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
            placeholder="服务名称"
            className="w-full rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 outline-none focus:border-sky-200 dark:border-cyan-400/14 dark:bg-slate-950 dark:text-slate-200 dark:focus:border-cyan-300/30"
          />
          <input
            value={draft.url}
            onChange={e => setDraft(d => ({ ...d, url: e.target.value }))}
            placeholder="服务 URL"
            className="w-full rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 outline-none focus:border-sky-200 dark:border-cyan-400/14 dark:bg-slate-950 dark:text-slate-200 dark:focus:border-cyan-300/30"
          />
          <input
            value={draft.description ?? ''}
            onChange={e => setDraft(d => ({ ...d, description: e.target.value }))}
            placeholder="描述（可选）"
            className="w-full rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-400 outline-none focus:border-sky-200 dark:border-cyan-400/14 dark:bg-slate-950 dark:text-slate-400 dark:focus:border-cyan-300/30"
          />
          <div className="flex items-center gap-2">
            <label className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
              <input type="checkbox" checked={draft.enabled} onChange={e => setDraft(d => ({ ...d, enabled: e.target.checked }))} className="accent-cyan-400" />
              启用
            </label>
          </div>
          <div className="flex gap-1.5">
            <button onClick={() => { setEditing(false); setDraft(server); }} className="flex-1 rounded bg-slate-800 py-1 text-xs text-slate-300 transition-colors hover:bg-slate-700">取消</button>
            <button onClick={save} className="flex-1 rounded bg-cyan-500 py-1 text-xs text-slate-950 transition-colors hover:bg-cyan-400">保存</button>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-2">
          <div className={cn('w-1.5 h-1.5 rounded-full mt-1 shrink-0', server.enabled ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-slate-600')} />
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-slate-700 dark:text-slate-200">{server.name}</div>
            <div className="mt-0.5 truncate text-[10px] text-sky-500 dark:text-sky-400">{server.url}</div>
            {server.description && <div className="mt-0.5 text-[10px] text-slate-400 dark:text-slate-500">{server.description}</div>}
            {server.source && <div className="mt-0.5 truncate text-[9px] text-sky-500 dark:text-sky-400">{server.source}</div>}
          </div>
          <button onClick={() => setEditing(true)} className="shrink-0 rounded p-1 text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-700 dark:text-slate-500 dark:hover:bg-slate-900 dark:hover:text-slate-200">
            <Edit2 size={10} />
          </button>
          <button onClick={onDelete} className="shrink-0 rounded p-1 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:text-slate-500 dark:hover:bg-red-500/15 dark:hover:text-red-300">
            <Trash2 size={10} />
          </button>
        </div>
      )}
    </div>
  );
}

function AddConfigDialog({
  title,
  manualNameLabel,
  manualPromptLabel,
  gitHint,
  scanKind,
  onClose,
  onCreateManual,
  onInstallSelected,
}: {
  title: string;
  manualNameLabel: string;
  manualPromptLabel: string;
  gitHint: string;
  scanKind: 'agents' | 'commands' | 'skills';
  onClose: () => void;
  onCreateManual: (name: string, prompt: string) => void;
  onInstallSelected: () => void;
}) {
  const { installableItems, setInstallableItems, sourceUrl, setSourceUrl } = useAppStore();
  const [manualName, setManualName] = useState('');
  const [manualPrompt, setManualPrompt] = useState('');

  const selectedCount = useMemo(() => installableItems.filter(s => s.selected).length, [installableItems]);

  const onScan = async () => {
    if (!sourceUrl.trim()) return;
    try {
      const res = await configApi.scan(scanKind, { url: sourceUrl.trim() });
      setInstallableItems(res.items.map(item => ({
        name: item.name,
        desc: item.desc ?? '',
        prompt: item.prompt ?? '',
        selected: item.selected,
        sourceUrl: item.sourceUrl,
      })));
    } catch {
      setInstallableItems([]);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-200/40 p-4 backdrop-blur-sm dark:bg-slate-950/55">
      <div className="max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-[28px] border border-slate-200 bg-white/95 shadow-[0_24px_80px_rgba(148,163,184,0.18)] dark:border-cyan-400/14 dark:bg-slate-950/95 dark:shadow-[0_24px_80px_rgba(2,6,23,0.55)]">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-cyan-400/12">
          <div className="text-sm font-semibold text-slate-800 dark:text-slate-100" data-ui-heading="true">{title}</div>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-700 dark:hover:bg-slate-900 dark:hover:text-slate-100">
            <X size={14} />
          </button>
        </div>

        <div className="space-y-6 p-5">
          <section className="space-y-3">
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">手工添加</div>
            <input
              value={manualName}
              onChange={e => setManualName(e.target.value)}
              placeholder={manualNameLabel}
              className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 outline-none focus:border-sky-200 dark:border-cyan-400/14 dark:bg-slate-950 dark:text-slate-200 dark:focus:border-cyan-300/30"
            />
            <textarea
              value={manualPrompt}
              onChange={e => setManualPrompt(e.target.value)}
              placeholder={manualPromptLabel}
              rows={4}
        className="w-full resize-none rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 outline-none focus:border-sky-200 dark:border-cyan-400/14 dark:bg-slate-950 dark:text-slate-200 dark:focus:border-cyan-300/30"
            />
            <button
              onClick={() => {
                if (!manualName.trim() || !manualPrompt.trim()) return;
                onCreateManual(manualName.trim(), manualPrompt.trim());
                setManualName('');
                setManualPrompt('');
              }}
              className="rounded-xl border border-sky-200 bg-[linear-gradient(135deg,rgba(96,165,250,0.94),rgba(129,140,248,0.9))] px-4 py-2 text-xs text-white transition-all hover:-translate-y-px hover:brightness-105 dark:border-cyan-300/20 dark:bg-[linear-gradient(135deg,rgba(14,165,233,0.98),rgba(99,102,241,0.96))] dark:hover:brightness-110"
            >
              添加
            </button>
          </section>

          <section className="space-y-3">
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">通过 Git URL 导入</div>
            <div className="text-[10px] text-slate-500">{gitHint}</div>
            <div className="flex gap-2">
              <input
                value={sourceUrl}
                onChange={e => setSourceUrl(e.target.value)}
                placeholder="https://...git"
                className="flex-1 rounded-2xl border border-cyan-400/14 bg-slate-950 px-3 py-2 text-xs text-slate-200 outline-none focus:border-cyan-300/30"
              />
              <button
                onClick={onScan}
                disabled={!sourceUrl.trim()}
                className="rounded-xl bg-slate-100 px-4 py-2 text-xs text-slate-700 transition-colors hover:bg-slate-200 disabled:opacity-50 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                扫描
              </button>
            </div>

            {installableItems.length > 0 && (
              <div className="space-y-2 rounded-[24px] border border-slate-200 p-3 dark:border-cyan-400/14">
                {installableItems.map(item => (
                  <label key={item.name} className="flex cursor-pointer items-start gap-2 rounded-2xl px-2 py-2 hover:bg-slate-50 dark:hover:bg-slate-900">
                    <input
                      type="checkbox"
                      checked={item.selected}
                      onChange={e => setInstallableItems(installableItems.map(s => s.name === item.name ? { ...s, selected: e.target.checked } : s))}
                      className="mt-0.5 accent-cyan-400"
                    />
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-slate-700 dark:text-slate-300">{item.name}</div>
                      <div className="line-clamp-2 text-[10px] text-slate-400 dark:text-slate-500">{item.desc || item.prompt}</div>
                    </div>
                  </label>
                ))}
                <button
                  onClick={onInstallSelected}
                  disabled={selectedCount === 0}
                  className="rounded-xl border border-sky-200 bg-[linear-gradient(135deg,rgba(96,165,250,0.94),rgba(129,140,248,0.9))] px-4 py-2 text-xs text-white transition-all hover:-translate-y-px hover:brightness-105 disabled:opacity-50 dark:border-cyan-300/20 dark:bg-[linear-gradient(135deg,rgba(14,165,233,0.98),rgba(99,102,241,0.96))] dark:hover:brightness-110"
                >
                  安装所选({selectedCount})
                </button>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

export function SettingsPanel({ onClose }: Props) {
  const {
    theme, toggleTheme, fontScale, setFontScale,
    agentModes, setAgentModes, activeMode, setActiveMode,
    slashCommands, setSlashCommands,
    skills, setSkills,
    mcpServers, setMcpServers,
    installableItems, setInstallableItems,
    sourceUrl, setSourceUrl,
  } = useAppStore();

  const [modesOpen, setModesOpen] = useState(true);
  const [cmdsOpen, setCmdsOpen] = useState(true);
  const [skillsOpen, setSkillsOpen] = useState(true);
  const [mcpOpen, setMcpOpen] = useState(true);
  const [dialogKind, setDialogKind] = useState<'agents' | 'commands' | 'skills' | null>(null);

  const saveMode = async (updated: AgentModeConfig) => {
    await configApi.create('agents', { name: updated.label, desc: updated.desc, prompt: updated.prompt });
    setAgentModes(agentModes.map(m => m.id === updated.id ? updated : m));
  };

  const deleteMode = async (id: string) => {
    await configApi.delete('agents', id);
    setAgentModes(agentModes.filter(m => m.id !== id));
    if (activeMode === id && agentModes.length > 1) {
      setActiveMode(agentModes.find(m => m.id !== id)?.id ?? '');
    }
  };

  const saveCmd = async (updated: SlashCommand) => {
    await configApi.create('commands', { name: updated.name, desc: updated.desc, prompt: updated.prompt });
    setSlashCommands(slashCommands.map(c => c.id === updated.id ? updated : c));
  };

  const saveSkill = async (updated: Skill) => {
    await configApi.create('skills', { name: updated.name, desc: updated.desc, prompt: updated.prompt, enabled: updated.enabled });
    setSkills(skills.map(s => s.id === updated.id ? updated : s));
  };

  const addMcp = async () => {
    const created = await configApi.create('mcp', { name: '新服务', url: '', enabled: false });
    setMcpServers([...mcpServers, { id: created.id, name: created.name, url: created.url ?? '', enabled: created.enabled, description: created.desc, source: created.source, builtin: created.builtin }]);
  };

  const saveMcp = async (updated: McpServer) => {
    await configApi.create('mcp', { name: updated.name, desc: updated.description, url: updated.url, enabled: updated.enabled });
    setMcpServers(mcpServers.map(m => m.id === updated.id ? updated : m));
  };

  const installSelected = async () => {
    const selected = installableItems.filter(s => s.selected);
    if (selected.length === 0 || !dialogKind) return;
    for (const item of selected) {
      await configApi.create(dialogKind, { name: item.name, desc: item.desc, prompt: item.prompt, url: item.sourceUrl || sourceUrl, candidate: item.name });
    }
    const refreshed = await configApi.list(dialogKind);
    if (dialogKind === 'agents') {
      setAgentModes(refreshed.items.map(item => ({ id: item.id, label: item.name, desc: item.desc ?? '', prompt: item.prompt ?? '', builtin: item.builtin, source: item.source })));
    } else if (dialogKind === 'commands') {
      setSlashCommands(refreshed.items.map(item => ({ id: item.id, name: item.name, desc: item.desc ?? '', prompt: item.prompt ?? '', builtin: item.builtin, source: item.source })));
    } else {
      setSkills(refreshed.items.map(item => ({ id: item.id, name: item.name, desc: item.desc ?? '', prompt: item.prompt ?? '', enabled: item.enabled, source: item.source, builtin: item.builtin })));
    }
    setInstallableItems([]);
    setSourceUrl('');
    setDialogKind(null);
  };

  const createManualAgent = async (name: string, prompt: string) => {
    const created = await configApi.create('agents', { name, prompt });
    setAgentModes([...agentModes, { id: created.id, label: created.name, desc: created.desc ?? '', prompt: created.prompt ?? '', builtin: created.builtin, source: created.source }]);
  };

  const createManualCommand = async (name: string, prompt: string) => {
    const created = await configApi.create('commands', { name, prompt });
    setSlashCommands([...slashCommands, { id: created.id, name: created.name, desc: created.desc ?? '', prompt: created.prompt ?? '', builtin: created.builtin, source: created.source }]);
  };

  const createManualSkill = async (name: string, prompt: string) => {
    const created = await configApi.create('skills', { name, prompt });
    setSkills([...skills, { id: created.id, name: created.name, desc: created.desc ?? '', prompt: created.prompt ?? '', enabled: created.enabled, source: created.source, builtin: created.builtin }]);
  };

  return (
    <div className="flex h-full flex-col bg-transparent px-3 py-3">
      <div className="flex shrink-0 items-center justify-between rounded-[24px] border border-slate-200 bg-white/88 px-4 py-3 shadow-[0_18px_40px_rgba(148,163,184,0.14)] dark:border-cyan-400/14 dark:bg-slate-950/88 dark:shadow-[0_18px_40px_rgba(2,6,23,0.28)]">
        <span className="text-sm font-semibold text-slate-800 dark:text-slate-100" data-ui-heading="true">设置</span>
        <button
          onClick={onClose}
          className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-700 dark:hover:bg-slate-900 dark:hover:text-slate-100"
        >
          <X size={14} />
        </button>
      </div>

      <div className="mt-3 flex-1 space-y-5 overflow-y-auto rounded-[24px] border border-slate-200 bg-white/72 p-4 shadow-[0_18px_40px_rgba(148,163,184,0.14)] dark:border-cyan-400/14 dark:bg-slate-950/74 dark:shadow-[0_18px_40px_rgba(2,6,23,0.28)]">
        <section>
          <div className="mb-3 text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">主题</div>
          <div className="flex gap-2">
            <button
              onClick={() => theme === 'dark' && toggleTheme()}
              className={cn(
                'flex flex-1 items-center justify-center gap-2 rounded-2xl border py-3 text-xs font-medium transition-colors',
                 theme === 'light'
                   ? 'border-sky-200 bg-sky-50 text-sky-700 shadow-sm dark:border-cyan-300/26 dark:bg-slate-900 dark:text-cyan-200'
                   : 'border-slate-200 bg-white text-slate-500 hover:border-sky-200 dark:border-cyan-400/14 dark:bg-slate-950 dark:text-slate-500 dark:hover:border-cyan-300/24'
              )}
            >
              <Sun size={13} />亮色
            </button>
            <button
              onClick={() => theme === 'light' && toggleTheme()}
              className={cn(
                'flex flex-1 items-center justify-center gap-2 rounded-2xl border py-3 text-xs font-medium transition-colors',
                 theme === 'dark'
                   ? 'border-cyan-300/26 bg-slate-900 text-cyan-200 shadow-sm'
                   : 'border-slate-200 bg-white text-slate-500 hover:border-sky-200 dark:border-cyan-400/14 dark:bg-slate-950 dark:text-slate-500 dark:hover:border-cyan-300/24'
              )}
            >
              <Moon size={13} />暗色
            </button>
          </div>
        </section>

        <section>
          <div className="mb-3 text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">字体大小</div>
          <div className="grid grid-cols-3 gap-2">
            {FONT_SCALE_OPTIONS.map(option => (
              <button
                key={option.id}
                onClick={() => setFontScale(option.id)}
                className={cn(
                  'rounded-2xl border px-3 py-3 text-left transition-colors',
                  fontScale === option.id
                    ? 'border-sky-200 bg-sky-50 text-sky-700 dark:border-cyan-300/26 dark:bg-slate-900 dark:text-cyan-200'
                    : 'border-slate-200 bg-white text-slate-400 hover:border-sky-200 hover:text-slate-700 dark:border-cyan-400/14 dark:bg-slate-950 dark:text-slate-400 dark:hover:border-cyan-300/24 dark:hover:text-slate-200'
                )}
              >
                <div className="text-xs font-semibold">{option.label}</div>
                <div className="mt-1 text-[10px] text-slate-500">{option.desc}</div>
              </button>
            ))}
          </div>
        </section>

        <section>
          <SectionHeader title="Agent 模式" open={modesOpen} onToggle={() => setModesOpen(o => !o)} onAdd={() => setDialogKind('agents')} />
          {modesOpen && (
            <div className="space-y-2">
              {agentModes.map(m => (
                <ModeItem
                  key={m.id}
                  mode={m}
                  active={activeMode === m.id}
                  onSelect={() => setActiveMode(m.id)}
                  onDelete={() => void deleteMode(m.id)}
                  onSave={updated => void saveMode(updated)}
                />
              ))}
               {agentModes.length === 0 && <div className="py-2 text-xs text-slate-500">暂无模式</div>}
            </div>
          )}
        </section>

        <section>
          <SectionHeader title="快捷命令 (/)" open={cmdsOpen} onToggle={() => setCmdsOpen(o => !o)} onAdd={() => setDialogKind('commands')} />
          {cmdsOpen && (
            <div className="space-y-2">
              {slashCommands.map(c => (
                <SlashCommandItem
                  key={c.id}
                  cmd={c}
                  onDelete={() => void configApi.delete('commands', c.id).then(() => setSlashCommands(slashCommands.filter(x => x.id !== c.id)))}
                  onSave={updated => void saveCmd(updated)}
                />
              ))}
               {slashCommands.length === 0 && <div className="py-2 text-xs text-slate-500">暂无命令</div>}
            </div>
          )}
        </section>

        <section>
          <SectionHeader title="技能" open={skillsOpen} onToggle={() => setSkillsOpen(o => !o)} onAdd={() => setDialogKind('skills')} />
          {skillsOpen && (
            <div className="space-y-2">
              {skills.map(s => (
                <SkillItem
                  key={s.id}
                  skill={s}
                  onDelete={() => void configApi.delete('skills', s.id).then(() => setSkills(skills.filter(x => x.id !== s.id)))}
                  onSave={updated => void saveSkill(updated)}
                />
              ))}
               {skills.length === 0 && <div className="py-2 text-xs text-slate-500">暂无技能</div>}
            </div>
          )}
        </section>

        <section>
          <SectionHeader title="MCP 服务" open={mcpOpen} onToggle={() => setMcpOpen(o => !o)} onAdd={() => void addMcp()} />
          {mcpOpen && (
            <div className="space-y-2">
              {mcpServers.map(m => (
                <McpItem
                  key={m.id}
                  server={m}
                  onDelete={() => void configApi.delete('mcp', m.id).then(() => setMcpServers(mcpServers.filter(x => x.id !== m.id)))}
                  onSave={updated => void saveMcp(updated)}
                />
              ))}
               {mcpServers.length === 0 && <div className="py-2 text-xs text-slate-500">暂无 MCP 服务</div>}
            </div>
          )}
        </section>
      </div>

      {dialogKind === 'agents' && (
        <AddConfigDialog
          title="添加 Agent 模式"
          manualNameLabel="模式名称"
          manualPromptLabel="模式提示词"
          gitHint="要求仓库根目录存在 agents 目录。"
          scanKind="agents"
          onClose={() => { setDialogKind(null); setInstallableItems([]); setSourceUrl(''); }}
          onCreateManual={(name, prompt) => void createManualAgent(name, prompt)}
          onInstallSelected={() => void installSelected()}
        />
      )}
      {dialogKind === 'commands' && (
        <AddConfigDialog
          title="添加快捷命令"
          manualNameLabel="命令名称"
          manualPromptLabel="命令提示词"
          gitHint="要求仓库根目录存在 commands 目录。"
          scanKind="commands"
          onClose={() => { setDialogKind(null); setInstallableItems([]); setSourceUrl(''); }}
          onCreateManual={(name, prompt) => void createManualCommand(name, prompt)}
          onInstallSelected={() => void installSelected()}
        />
      )}
      {dialogKind === 'skills' && (
        <AddConfigDialog
          title="添加技能"
          manualNameLabel="技能名称"
          manualPromptLabel="技能提示词"
          gitHint="要求仓库根目录存在 skills 目录，并扫描子目录中的 SKILL.md。"
          scanKind="skills"
          onClose={() => { setDialogKind(null); setInstallableItems([]); setSourceUrl(''); }}
          onCreateManual={(name, prompt) => void createManualSkill(name, prompt)}
          onInstallSelected={() => void installSelected()}
        />
      )}
    </div>
  );
}
