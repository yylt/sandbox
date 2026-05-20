import { useMemo, useState } from 'react';
import { X, Sun, Moon, Plus, Trash2, ChevronDown, Edit2, Check } from 'lucide-react';
import { configApi } from '../api/client';
import { useAppStore } from '../store/AppContext';
import { cn } from '../lib/utils';
import type { AgentModeConfig, SlashCommand, Skill, McpServer, InstallableItem } from '../store/AppContext';

interface Props {
  onClose: () => void;
}

function SectionHeader({ title, open, onToggle, onAdd }: { title: string; open: boolean; onToggle: () => void; onAdd?: () => void }) {
  return (
    <div className="flex items-center gap-1 mb-2">
      <button
        onClick={onToggle}
        className="flex items-center gap-1 flex-1 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-300 transition-colors"
      >
        <ChevronDown size={12} className={cn('transition-transform', !open && '-rotate-90')} />
        {title}
      </button>
      {onAdd && (
        <button
          onClick={onAdd}
          className="w-5 h-5 rounded flex items-center justify-center bg-gray-100 dark:bg-slate-700 hover:bg-indigo-600 text-gray-400 hover:text-white transition-colors"
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
    <div className="space-y-1.5">
      <div className="text-[11px] font-medium text-gray-500 dark:text-slate-400">{title}</div>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        rows={4}
        className="w-full text-xs bg-white dark:bg-slate-700 text-gray-800 dark:text-white rounded px-2 py-1 outline-none border border-gray-200 dark:border-slate-600 focus:border-indigo-400 resize-none"
      />
      <div className="flex gap-1.5">
        <button onClick={onCancel} className="flex-1 text-xs py-1 rounded bg-gray-200 dark:bg-slate-600 text-gray-600 dark:text-slate-300 hover:bg-gray-300 dark:hover:bg-slate-500 transition-colors">取消</button>
        <button onClick={onSave} className="flex-1 text-xs py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white transition-colors flex items-center justify-center gap-1"><Check size={10} />保存</button>
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
      'rounded-lg border p-2.5 transition-colors',
      active ? 'border-indigo-400 dark:border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20' : 'border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-800'
    )}>
      {editing ? (
        <div className="space-y-1.5">
          <div className="text-[11px] font-medium text-gray-500 dark:text-slate-400">{mode.label} — 描述</div>
          <input
            value={draftDesc}
            onChange={e => setDraftDesc(e.target.value)}
            placeholder="描述"
            className="w-full text-xs bg-white dark:bg-slate-700 text-gray-800 dark:text-white rounded px-2 py-1 outline-none border border-gray-200 dark:border-slate-600 focus:border-indigo-400"
          />
          <div className="text-[11px] font-medium text-gray-500 dark:text-slate-400 pt-0.5">提示词</div>
          <textarea
            value={draftPrompt}
            onChange={e => setDraftPrompt(e.target.value)}
            rows={4}
            className="w-full text-xs bg-white dark:bg-slate-700 text-gray-800 dark:text-white rounded px-2 py-1 outline-none border border-gray-200 dark:border-slate-600 focus:border-indigo-400 resize-none"
          />
          <div className="flex gap-1.5">
            <button onClick={cancel} className="flex-1 text-xs py-1 rounded bg-gray-200 dark:bg-slate-600 text-gray-600 dark:text-slate-300 hover:bg-gray-300 dark:hover:bg-slate-500 transition-colors">取消</button>
            <button onClick={save} className="flex-1 text-xs py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white transition-colors flex items-center justify-center gap-1"><Check size={10} />保存</button>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-2">
          <button onClick={onSelect} className="flex items-center gap-2 flex-1 text-left min-w-0">
            <div className="min-w-0">
              <div className="text-xs font-semibold text-gray-700 dark:text-slate-300">{mode.label}{mode.desc ? `(${mode.desc})` : ''}</div>
              {mode.source && <div className="text-[9px] text-blue-400 dark:text-blue-500 truncate mt-0.5">{mode.source}</div>}
            </div>
            {active && <span className="ml-auto text-[9px] bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 px-1 rounded shrink-0">当前</span>}
          </button>
          <button onClick={() => setEditing(true)} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-400 hover:text-gray-700 dark:hover:text-slate-200 transition-colors shrink-0">
            <Edit2 size={10} />
          </button>
          <button onClick={onDelete} className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-500/20 text-gray-400 hover:text-red-500 transition-colors shrink-0">
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
    <div className="rounded-lg border border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-800 p-2.5">
      {editing ? (
        <div className="space-y-1.5">
          <div className="text-[11px] font-medium text-gray-500 dark:text-slate-400">/{cmd.name} — 描述</div>
          <input
            value={draftDesc}
            onChange={e => setDraftDesc(e.target.value)}
            placeholder="描述（显示在 / 弹出列表中）"
            className="w-full text-xs bg-white dark:bg-slate-700 text-gray-800 dark:text-white rounded px-2 py-1 outline-none border border-gray-200 dark:border-slate-600 focus:border-indigo-400"
          />
          <div className="text-[11px] font-medium text-gray-500 dark:text-slate-400 pt-0.5">提示词</div>
          <textarea
            value={draftPrompt}
            onChange={e => setDraftPrompt(e.target.value)}
            placeholder="提示词模板，用 {% ARGUMENT %} 表示参数"
            rows={3}
            className="w-full text-xs bg-white dark:bg-slate-700 text-gray-800 dark:text-white rounded px-2 py-1 outline-none border border-gray-200 dark:border-slate-600 focus:border-indigo-400 resize-none"
          />
          <div className="flex gap-1.5">
            <button onClick={cancel} className="flex-1 text-xs py-1 rounded bg-gray-200 dark:bg-slate-600 text-gray-600 dark:text-slate-300 hover:bg-gray-300 dark:hover:bg-slate-500 transition-colors">取消</button>
            <button onClick={save} className="flex-1 text-xs py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white transition-colors flex items-center justify-center gap-1"><Check size={10} />保存</button>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <div className="text-xs font-mono font-semibold text-indigo-600 dark:text-indigo-400">/{cmd.name}</div>
            {cmd.desc && <div className="text-[10px] text-gray-500 dark:text-slate-400 mt-0.5">{cmd.desc}</div>}
            {cmd.source && <div className="text-[9px] text-blue-400 dark:text-blue-500 truncate mt-0.5">{cmd.source}</div>}
            <div className="text-[10px] text-gray-400 dark:text-slate-500 truncate mt-0.5">{cmd.prompt}</div>
          </div>
          <button onClick={() => setEditing(true)} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-400 hover:text-gray-700 dark:hover:text-slate-200 transition-colors shrink-0">
            <Edit2 size={10} />
          </button>
          <button onClick={onDelete} className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-500/20 text-gray-400 hover:text-red-500 transition-colors shrink-0">
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
    <div className="rounded-lg border border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-800 p-2.5">
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
            <div className="text-xs font-semibold text-gray-700 dark:text-slate-300">{skill.name}</div>
            <div className="text-[10px] text-gray-400 dark:text-slate-500 mt-0.5">{skill.desc}</div>
            {skill.source && <div className="text-[9px] text-blue-400 dark:text-blue-500 truncate mt-0.5">{skill.source}</div>}
          </div>
          <button onClick={() => setEditing(true)} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-400 hover:text-gray-700 dark:hover:text-slate-200 transition-colors shrink-0">
            <Edit2 size={10} />
          </button>
          <button onClick={onDelete} className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-500/20 text-gray-400 hover:text-red-500 transition-colors shrink-0">
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
    <div className="rounded-lg border border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-800 p-2.5">
      {editing ? (
        <div className="space-y-1.5">
          <input
            value={draft.name}
            onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
            placeholder="服务名称"
            className="w-full text-xs bg-white dark:bg-slate-700 text-gray-800 dark:text-white rounded px-2 py-1 outline-none border border-gray-200 dark:border-slate-600 focus:border-indigo-400"
          />
          <input
            value={draft.url}
            onChange={e => setDraft(d => ({ ...d, url: e.target.value }))}
            placeholder="服务 URL"
            className="w-full text-xs bg-white dark:bg-slate-700 text-gray-800 dark:text-white rounded px-2 py-1 outline-none border border-gray-200 dark:border-slate-600 focus:border-indigo-400"
          />
          <input
            value={draft.description ?? ''}
            onChange={e => setDraft(d => ({ ...d, description: e.target.value }))}
            placeholder="描述（可选）"
            className="w-full text-xs bg-white dark:bg-slate-700 text-gray-400 dark:text-slate-400 rounded px-2 py-1 outline-none border border-gray-200 dark:border-slate-600 focus:border-indigo-400"
          />
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-slate-400 cursor-pointer">
              <input type="checkbox" checked={draft.enabled} onChange={e => setDraft(d => ({ ...d, enabled: e.target.checked }))} className="accent-indigo-600" />
              启用
            </label>
          </div>
          <div className="flex gap-1.5">
            <button onClick={() => { setEditing(false); setDraft(server); }} className="flex-1 text-xs py-1 rounded bg-gray-200 dark:bg-slate-600 text-gray-600 dark:text-slate-300 hover:bg-gray-300 dark:hover:bg-slate-500 transition-colors">取消</button>
            <button onClick={save} className="flex-1 text-xs py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white transition-colors">保存</button>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-2">
          <div className={cn('w-1.5 h-1.5 rounded-full mt-1 shrink-0', server.enabled ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-slate-600')} />
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-gray-700 dark:text-slate-300">{server.name}</div>
            <div className="text-[10px] text-blue-400 dark:text-blue-500 truncate mt-0.5">{server.url}</div>
            {server.description && <div className="text-[10px] text-gray-400 dark:text-slate-500 mt-0.5">{server.description}</div>}
            {server.source && <div className="text-[9px] text-blue-400 dark:text-blue-500 truncate mt-0.5">{server.source}</div>}
          </div>
          <button onClick={() => setEditing(true)} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-400 hover:text-gray-700 dark:hover:text-slate-200 transition-colors shrink-0">
            <Edit2 size={10} />
          </button>
          <button onClick={onDelete} className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-500/20 text-gray-400 hover:text-red-500 transition-colors shrink-0">
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
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="w-full max-w-xl max-h-[85vh] overflow-y-auto rounded-xl bg-white dark:bg-[#161b22] border border-gray-200 dark:border-slate-700 shadow-xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-slate-700">
          <div className="text-sm font-semibold text-gray-800 dark:text-slate-200">{title}</div>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-400 hover:text-gray-700 dark:hover:text-white transition-colors">
            <X size={14} />
          </button>
        </div>

        <div className="p-4 space-y-5">
          <section className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">手工添加</div>
            <input
              value={manualName}
              onChange={e => setManualName(e.target.value)}
              placeholder={manualNameLabel}
              className="w-full text-xs bg-white dark:bg-slate-700 text-gray-800 dark:text-white rounded px-2 py-1.5 outline-none border border-gray-200 dark:border-slate-600 focus:border-indigo-400"
            />
            <textarea
              value={manualPrompt}
              onChange={e => setManualPrompt(e.target.value)}
              placeholder={manualPromptLabel}
              rows={4}
              className="w-full text-xs bg-white dark:bg-slate-700 text-gray-800 dark:text-white rounded px-2 py-1.5 outline-none border border-gray-200 dark:border-slate-600 focus:border-indigo-400 resize-none"
            />
            <button
              onClick={() => {
                if (!manualName.trim() || !manualPrompt.trim()) return;
                onCreateManual(manualName.trim(), manualPrompt.trim());
                setManualName('');
                setManualPrompt('');
              }}
              className="text-xs px-3 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
            >
              添加
            </button>
          </section>

          <section className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">通过 Git URL 导入</div>
            <div className="text-[10px] text-gray-400 dark:text-slate-500">{gitHint}</div>
            <div className="flex gap-2">
              <input
                value={sourceUrl}
                onChange={e => setSourceUrl(e.target.value)}
                placeholder="https://...git"
                className="flex-1 text-xs bg-white dark:bg-slate-700 text-gray-800 dark:text-white rounded px-2 py-1.5 outline-none border border-gray-200 dark:border-slate-600 focus:border-indigo-400"
              />
              <button
                onClick={onScan}
                disabled={!sourceUrl.trim()}
                className="text-xs px-3 py-1.5 rounded bg-gray-200 dark:bg-slate-700 hover:bg-gray-300 dark:hover:bg-slate-600 disabled:opacity-50 text-gray-700 dark:text-slate-200 transition-colors"
              >
                扫描
              </button>
            </div>

            {installableItems.length > 0 && (
              <div className="space-y-2 border border-gray-200 dark:border-slate-700 rounded-lg p-2.5">
                {installableItems.map(item => (
                  <label key={item.name} className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={item.selected}
                      onChange={e => setInstallableItems(installableItems.map(s => s.name === item.name ? { ...s, selected: e.target.checked } : s))}
                      className="mt-0.5 accent-indigo-600"
                    />
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-gray-700 dark:text-slate-300">{item.name}</div>
                      <div className="text-[10px] text-gray-400 dark:text-slate-500 line-clamp-2">{item.desc || item.prompt}</div>
                    </div>
                  </label>
                ))}
                <button
                  onClick={onInstallSelected}
                  disabled={selectedCount === 0}
                  className="text-xs px-3 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white transition-colors"
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
    theme, toggleTheme,
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
    <div className="flex flex-col h-full bg-white dark:bg-[#161b22]">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-slate-700 shrink-0">
        <span className="text-sm font-semibold text-gray-800 dark:text-slate-200">设置</span>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-400 hover:text-gray-700 dark:hover:text-white transition-colors"
        >
          <X size={14} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        <section>
          <div className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400 mb-3">主题</div>
          <div className="flex gap-2">
            <button
              onClick={() => theme === 'dark' && toggleTheme()}
              className={cn(
                'flex-1 flex items-center justify-center gap-2 py-2 rounded-lg border text-xs font-medium transition-colors',
                theme === 'light'
                  ? 'bg-white border-indigo-400 text-indigo-700 shadow-sm'
                  : 'bg-gray-50 dark:bg-slate-800 border-gray-200 dark:border-slate-600 text-gray-500 dark:text-slate-400 hover:border-gray-300'
              )}
            >
              <Sun size={13} />亮色
            </button>
            <button
              onClick={() => theme === 'light' && toggleTheme()}
              className={cn(
                'flex-1 flex items-center justify-center gap-2 py-2 rounded-lg border text-xs font-medium transition-colors',
                theme === 'dark'
                  ? 'bg-slate-700 border-indigo-400 text-indigo-300 shadow-sm'
                  : 'bg-gray-50 dark:bg-slate-800 border-gray-200 dark:border-slate-600 text-gray-500 dark:text-slate-400 hover:border-gray-300'
              )}
            >
              <Moon size={13} />暗色
            </button>
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
              {agentModes.length === 0 && <div className="text-xs text-gray-400 dark:text-slate-500 py-2">暂无模式</div>}
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
              {slashCommands.length === 0 && <div className="text-xs text-gray-400 dark:text-slate-500 py-2">暂无命令</div>}
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
              {skills.length === 0 && <div className="text-xs text-gray-400 dark:text-slate-500 py-2">暂无技能</div>}
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
              {mcpServers.length === 0 && <div className="text-xs text-gray-400 dark:text-slate-500 py-2">暂无 MCP 服务</div>}
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
