import { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Loader2, ChevronDown, Terminal as TerminalIcon, X, ChevronUp, Zap } from 'lucide-react';
import { useAppStore } from '../store/AppContext';
import { messagesApi } from '../api/client';
import { TerminalPanel } from './TerminalPanel';
import { cn } from '../lib/utils';
const MODELS = [
  { id: 'gpt-4o', label: 'GPT-4o' },
  { id: 'gpt-4o-mini', label: 'GPT-4o Mini' },
  { id: 'claude-3-5-sonnet', label: 'Claude 3.5 Sonnet' },
  { id: 'claude-3-haiku', label: 'Claude 3 Haiku' },
  { id: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro' },
  { id: 'deepseek-chat', label: 'DeepSeek Chat' },
];

interface Props {
  terminalOpen: boolean;
  onTerminalToggle: () => void;
  onTerminalClose: () => void;
}

export function ChatArea({ terminalOpen, onTerminalToggle, onTerminalClose }: Props) {
  const {
    activeSession, activeProject, messages, setMessages, appendMessage,
    selectedModel, setSelectedModel,
    agentModes, activeMode, setActiveMode,
    skills, setSkills,
    slashCommands,
  } = useAppStore();
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const [modeOpen, setModeOpen] = useState(false);
  const [skillsOpen, setSkillsOpen] = useState(false);
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashIndex, setSlashIndex] = useState(0);
  const [terminalHeight, setTerminalHeight] = useState(240);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const inputAreaRef = useRef<HTMLDivElement>(null);
  const termDragRef = useRef(false);
  const termDragStartY = useRef(0);
  const termDragStartH = useRef(0);

  const closeDropdowns = () => {
    setModelOpen(false);
    setModeOpen(false);
    setSkillsOpen(false);
    setSlashOpen(false);
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (inputAreaRef.current && !inputAreaRef.current.contains(e.target as Node)) {
        closeDropdowns();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (!activeSession) { setMessages([]); return; }
    messagesApi.list(activeSession.id).then(r => {
      setMessages(r.items);
    }).catch(() => setMessages([]));
  }, [activeSession?.id, setMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const currentModel = MODELS.find(m => m.id === selectedModel) ?? MODELS[0];
  const currentModeConfig = agentModes.find(m => m.id === activeMode) ?? agentModes[0];
  const enabledSkills = skills.filter(s => s.enabled);

  const send = async () => {
    const text = input.trim();
    if (!text || loading || !activeSession) return;
    setInput('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
    setLoading(true);

    try {
      const userMsg = await messagesApi.create(activeSession.id, {
        role: 'user',
        content: text,
        model: currentModel.id,
      });
      appendMessage(userMsg);

      setTimeout(async () => {
        try {
          const reply = await messagesApi.create(activeSession.id, {
            role: 'assistant',
            content: `Received: "${text}"\n\n_AI response will appear here once connected to the LLM backend._`,
            model: currentModel.id,
          });
          appendMessage(reply);
        } catch {}
        setLoading(false);
      }, 800);
    } catch {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (slashOpen && slashCommands.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSlashIndex(i => (i + 1) % slashCommands.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSlashIndex(i => (i - 1 + slashCommands.length) % slashCommands.length);
        return;
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        applySlashCommand(slashCommands[slashIndex]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setSlashOpen(false);
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const adjustHeight = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 160) + 'px';
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInput(val);
    adjustHeight();
    const open = val === '/';
    setSlashOpen(open);
    if (open) setSlashIndex(0);
  };

  const applySlashCommand = (cmd: { name: string; prompt: string }) => {
    setInput(`/${cmd.name} `);
    setSlashOpen(false);
    setSlashIndex(0);
    textareaRef.current?.focus();
  };

  const onTermResizeMouseDown = (e: React.MouseEvent) => {
    termDragRef.current = true;
    termDragStartY.current = e.clientY;
    termDragStartH.current = terminalHeight;
    e.preventDefault();
    const onMove = (ev: MouseEvent) => {
      if (!termDragRef.current) return;
      const delta = termDragStartY.current - ev.clientY;
      setTerminalHeight(Math.max(120, Math.min(600, termDragStartH.current + delta)));
    };
    const onUp = () => {
      termDragRef.current = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const MODE_COLORS: Record<string, string> = {
    plan: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300',
    auto: 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300',
    yolo: 'bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300',
  };

  const modeColor = currentModeConfig
    ? (MODE_COLORS[currentModeConfig.id] ?? 'bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-slate-300')
    : 'bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-slate-300';

  if (!activeProject) {
    return (
      <div className="flex-1 flex items-center justify-center flex-col gap-3 text-gray-400 dark:text-slate-600">
        <Bot size={48} className="opacity-30" />
        <p className="text-sm">Select a project to start chatting</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-white dark:bg-[#0f1117]">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-[#161b22] shrink-0">
        <Bot size={16} className="text-indigo-500" />
        <span className="text-sm font-medium text-gray-800 dark:text-slate-200">
          {activeSession ? activeSession.name : activeProject.name}
        </span>
        {activeSession && (
          <span className={cn(
            'ml-auto text-[10px] px-2 py-0.5 rounded-full',
            activeSession.status === 'active'
              ? 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400'
              : activeSession.status === 'idle'
              ? 'bg-yellow-100 dark:bg-yellow-900/50 text-yellow-600 dark:text-yellow-400'
              : 'bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-slate-400'
          )}>
            {activeSession.status}
          </span>
        )}
        {/* Terminal toggle button */}
        <button
          onClick={onTerminalToggle}
          title="终端"
          className={cn(
            'ml-2 flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors',
            terminalOpen
              ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300'
              : 'text-gray-400 dark:text-slate-500 hover:bg-gray-100 dark:hover:bg-slate-700 hover:text-gray-700 dark:hover:text-slate-200'
          )}
        >
          <TerminalIcon size={13} />
          <span className="hidden sm:inline">终端</span>
          {terminalOpen ? <ChevronDown size={11} /> : <ChevronUp size={11} />}
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 min-h-0">
        {!activeSession && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-400 dark:text-slate-600">
            <Bot size={40} className="opacity-20" />
            <p className="text-sm">Select or create a session to start chatting</p>
          </div>
        )}

        {activeSession && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-400 dark:text-slate-600">
            <Bot size={40} className="opacity-20" />
            <p className="text-sm">Start a conversation</p>
          </div>
        )}

        {messages.map(msg => (
          <div key={msg.id} className={cn('flex gap-3', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
            {msg.role === 'assistant' && (
              <div className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center shrink-0 mt-0.5">
                <Bot size={14} className="text-white" />
              </div>
            )}
            <div className={cn(
              'max-w-[75%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap',
              msg.role === 'user'
                ? 'bg-indigo-600 text-white rounded-br-sm'
                : 'bg-gray-100 dark:bg-slate-800 text-gray-800 dark:text-slate-200 rounded-bl-sm'
            )}>
              {msg.content}
              <div className="text-[10px] opacity-40 mt-1 text-right">
                {new Date(msg.createdAt).toLocaleTimeString()}
                {msg.model && <span className="ml-1 opacity-70">· {msg.model}</span>}
              </div>
            </div>
            {msg.role === 'user' && (
              <div className="w-7 h-7 rounded-full bg-gray-200 dark:bg-slate-700 flex items-center justify-center shrink-0 mt-0.5">
                <User size={14} className="text-gray-600 dark:text-slate-300" />
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex gap-3">
            <div className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center shrink-0">
              <Bot size={14} className="text-white" />
            </div>
            <div className="bg-gray-100 dark:bg-slate-800 rounded-2xl rounded-bl-sm px-4 py-3">
              <Loader2 size={16} className="animate-spin text-indigo-500" />
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div className="px-4 pb-4 shrink-0" ref={inputAreaRef}>
        {/* Active skills badges */}
        {enabledSkills.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-1.5 px-1">
            {enabledSkills.map(s => (
              <span
                key={s.id}
                className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300"
              >
                <Zap size={9} />
                {s.name}
                <button
                  onClick={() => setSkills(skills.map(sk => sk.id === s.id ? { ...sk, enabled: false } : sk))}
                  className="ml-0.5 hover:text-red-500 transition-colors"
                >
                  <X size={9} />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Slash command popup */}
        {slashOpen && slashCommands.length > 0 && (
          <div className="mb-1.5 bg-white dark:bg-[#1e2530] rounded-xl shadow-lg border border-gray-200 dark:border-slate-700 py-1 overflow-hidden">
            {slashCommands.map((cmd, index) => (
              <button
                key={cmd.id}
                onMouseDown={e => { e.preventDefault(); applySlashCommand(cmd); }}
                className={cn(
                  'w-full flex items-start gap-2 px-3 py-1.5 text-left transition-colors',
                  index === slashIndex
                    ? 'bg-indigo-50 dark:bg-indigo-900/30'
                    : 'hover:bg-gray-50 dark:hover:bg-slate-700'
                )}
              >
                <span className="text-xs font-mono font-semibold text-indigo-600 dark:text-indigo-400 shrink-0">/{cmd.name}</span>
                <span className="text-[11px] text-gray-400 dark:text-slate-500 truncate">{cmd.desc || cmd.prompt}</span>
              </button>
            ))}
          </div>
        )}

        <div className="bg-gray-50 dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 focus-within:border-indigo-400 dark:focus-within:border-indigo-500 transition-colors">
          <div className="px-3 pt-2">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder={activeSession ? 'Message AI... (/ for commands, Enter to send)' : 'Select or create a session first...'}
              disabled={!activeSession}
              rows={2}
              className="w-full bg-transparent text-sm text-gray-800 dark:text-slate-200 placeholder-gray-400 dark:placeholder-slate-500 outline-none resize-none max-h-40 leading-relaxed disabled:cursor-not-allowed"
            />
          </div>
          {/* Bottom toolbar */}
          <div className="flex items-center gap-2 px-3 pb-2 pt-1">
            {/* Model selector */}
            <div className="relative">
              <button
                onClick={() => { setModelOpen(o => !o); setModeOpen(false); setSkillsOpen(false); }}
                disabled={!activeSession}
                className="flex items-center gap-1 text-[11px] text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 rounded-md px-2 py-1 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span>{currentModel.label}</span>
                <ChevronDown size={11} />
              </button>
              {modelOpen && (
                <div className="absolute bottom-full mb-1 left-0 w-48 bg-white dark:bg-[#1e2530] rounded-xl shadow-lg border border-gray-200 dark:border-slate-700 py-1 z-20">
                  {MODELS.map(m => (
                    <button
                      key={m.id}
                      onClick={() => { setSelectedModel(m.id); setModelOpen(false); }}
                      className={cn(
                        'w-full text-left px-3 py-1.5 text-xs transition-colors',
                        m.id === currentModel.id
                          ? 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30'
                          : 'text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700'
                      )}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Mode selector */}
            <div className="relative">
              <button
                onClick={() => { setModeOpen(o => !o); setModelOpen(false); setSkillsOpen(false); }}
                disabled={!activeSession}
                className={cn(
                  'flex items-center gap-1 text-[11px] rounded-md px-2 py-1 transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
                  modeColor
                )}
              >
                <span>{currentModeConfig?.label ?? 'Mode'}</span>
                <ChevronDown size={11} />
              </button>
              {modeOpen && (
                <div className="absolute bottom-full mb-1 left-0 w-52 bg-white dark:bg-[#1e2530] rounded-xl shadow-lg border border-gray-200 dark:border-slate-700 py-1 z-20">
                  {agentModes.map(m => (
                    <button
                      key={m.id}
                      onClick={() => { setActiveMode(m.id); setModeOpen(false); }}
                      className={cn(
                        'w-full text-left px-3 py-1.5 transition-colors',
                        m.id === activeMode
                          ? 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30'
                          : 'text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700'
                      )}
                    >
                      <div className="text-xs font-medium">{m.label}</div>
                      <div className="text-[10px] opacity-60 mt-0.5">{m.desc}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Skills picker */}
            <div className="relative">
              <button
                onClick={() => { setSkillsOpen(o => !o); setModelOpen(false); setModeOpen(false); }}
                disabled={!activeSession}
                className={cn(
                  'flex items-center gap-1 text-[11px] rounded-md px-2 py-1 transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
                  enabledSkills.length > 0
                    ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300'
                    : 'text-gray-500 dark:text-slate-400 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600'
                )}
              >
                <Zap size={11} />
                <span>技能{enabledSkills.length > 0 ? ` (${enabledSkills.length})` : ''}</span>
                <ChevronDown size={11} />
              </button>
              {skillsOpen && (
                <div className="absolute bottom-full mb-1 left-0 w-56 bg-white dark:bg-[#1e2530] rounded-xl shadow-lg border border-gray-200 dark:border-slate-700 py-1 z-20">
                  {skills.length === 0 && (
                    <div className="text-xs text-gray-400 dark:text-slate-500 px-3 py-2">暂无技能（在设置中添加）</div>
                  )}
                  {skills.map(s => (
                    <label
                      key={s.id}
                      className="flex items-start gap-2 px-3 py-1.5 hover:bg-gray-50 dark:hover:bg-slate-700 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={s.enabled}
                        onChange={e => setSkills(skills.map(sk => sk.id === s.id ? { ...sk, enabled: e.target.checked } : sk))}
                        className="mt-0.5 accent-indigo-600"
                      />
                      <div>
                        <div className="text-xs font-medium text-gray-700 dark:text-slate-300">{s.name}</div>
                        <div className="text-[10px] text-gray-400 dark:text-slate-500">{s.desc}</div>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {/* Send button */}
            <button
              onClick={send}
              disabled={!input.trim() || loading || !activeSession}
              title="Send (Enter)"
              className="ml-auto flex items-center gap-1.5 h-7 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-200 dark:disabled:bg-slate-700 disabled:cursor-not-allowed text-white text-xs font-medium transition-colors shrink-0"
            >
              <Send size={12} />
              <span className="text-[10px] opacity-80">Enter</span>
            </button>
          </div>
        </div>
      </div>

      {/* Terminal panel — bottommost, no inner header, resizable from top edge */}
      {terminalOpen && (
        <div
          className="shrink-0 flex flex-col border-t border-gray-200 dark:border-slate-700 bg-white dark:bg-[#0d1117] relative"
          style={{ height: terminalHeight }}
        >
          {/* Resize bar */}
          <div
            onMouseDown={onTermResizeMouseDown}
            className="absolute top-0 left-0 right-0 h-1 cursor-row-resize hover:bg-indigo-400/50 transition-colors z-10"
          />
          <div className="flex-1 overflow-hidden min-h-0">
            <TerminalPanel />
          </div>
        </div>
      )}
    </div>
  );
}
