import { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Loader2, ChevronDown, Terminal as TerminalIcon, X, ChevronUp, Zap } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
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

function MarkdownMessage({ content }: { content: string }) {
  return (
    <div className="markdown-body break-words">
      <ReactMarkdown
        components={{
          p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
          ul: ({ children }) => <ul className="mb-3 ml-5 list-disc space-y-1 last:mb-0">{children}</ul>,
          ol: ({ children }) => <ol className="mb-3 ml-5 list-decimal space-y-1 last:mb-0">{children}</ol>,
          li: ({ children }) => <li>{children}</li>,
          code: ({ inline, children }) =>
            inline ? (
              <code className="rounded-md bg-black/8 px-1.5 py-0.5 font-mono text-[0.92em] dark:bg-white/10">{children}</code>
            ) : (
              <code className="block overflow-x-auto rounded-2xl bg-slate-950/90 px-4 py-3 font-mono text-[12px] text-slate-100 dark:bg-black/30">{children}</code>
            ),
          pre: ({ children }) => <pre className="mb-3 overflow-x-auto last:mb-0">{children}</pre>,
          a: ({ href, children }) => <a href={href} className="text-current underline underline-offset-4 opacity-90" target="_blank" rel="noreferrer">{children}</a>,
          h1: ({ children }) => <h1 className="mb-3 text-lg font-semibold last:mb-0">{children}</h1>,
          h2: ({ children }) => <h2 className="mb-3 text-base font-semibold last:mb-0">{children}</h2>,
          h3: ({ children }) => <h3 className="mb-2 text-sm font-semibold last:mb-0">{children}</h3>,
          blockquote: ({ children }) => <blockquote className="mb-3 border-l-2 border-current/20 pl-3 italic opacity-85 last:mb-0">{children}</blockquote>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
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
  const [terminalHeight, setTerminalHeight] = useState(188);
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
    plan: 'border border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-300/20 dark:bg-sky-400/10 dark:text-sky-200',
    auto: 'border border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-300/20 dark:bg-indigo-400/12 dark:text-indigo-200',
    yolo: 'border border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700 dark:border-fuchsia-300/20 dark:bg-fuchsia-400/12 dark:text-fuchsia-200',
  };

  const modeColor = currentModeConfig
    ? (MODE_COLORS[currentModeConfig.id] ?? 'border border-slate-200 bg-white/88 text-slate-700 dark:border-cyan-400/14 dark:bg-slate-900/88 dark:text-slate-300')
    : 'border border-slate-200 bg-white/88 text-slate-700 dark:border-cyan-400/14 dark:bg-slate-900/88 dark:text-slate-300';

  if (!activeProject) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center text-slate-500 dark:text-slate-500">
        <div className="flex h-16 w-16 items-center justify-center rounded-[24px] border border-slate-200 bg-white/88 shadow-[0_18px_45px_rgba(148,163,184,0.18)] dark:border-cyan-400/20 dark:bg-slate-950/80 dark:shadow-[0_18px_45px_rgba(2,6,23,0.45)]">
          <Bot size={30} className="opacity-60" />
        </div>
        <div>
          <p className="text-base font-semibold text-slate-700 dark:text-slate-200" data-ui-heading="true">Select a project to start chatting</p>
          <p className="mt-1 text-sm">On mobile, open the left panel first to choose a project and session.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col bg-transparent lg:px-2 lg:py-2">
      {/* Header */}
      <div className="shrink-0 border-b border-slate-200/80 bg-white/76 px-4 py-3 backdrop-blur-xl dark:border-cyan-400/15 dark:bg-slate-950/72 lg:rounded-[24px] lg:border lg:px-5 lg:shadow-[0_18px_50px_rgba(148,163,184,0.14)] dark:lg:shadow-[0_18px_50px_rgba(2,6,23,0.35)]">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-2xl border border-sky-200 bg-sky-50 text-sky-700 shadow-[inset_0_0_18px_rgba(125,211,252,0.22)] dark:border-cyan-400/20 dark:bg-cyan-400/10 dark:text-cyan-200 dark:shadow-[inset_0_0_18px_rgba(34,211,238,0.12)]">
            <Bot size={16} />
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100" data-ui-heading="true">
          {activeSession ? activeSession.name : activeProject.name}
            </div>
            <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500 dark:text-cyan-200/45">{activeProject.name}</div>
          </div>
        {activeSession && (
          <span className={cn(
            'ml-auto rounded-full border px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.2em]',
            activeSession.status === 'active'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/25 dark:bg-emerald-400/10 dark:text-emerald-300'
              : activeSession.status === 'idle'
              ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200'
              : 'border-slate-200 bg-white/78 text-slate-500 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-400'
          )}>
            {activeSession.status}
          </span>
        )}
        {/* Terminal toggle button */}
        <button
          onClick={onTerminalToggle}
          title="终端"
          className={cn(
            'ml-2 flex h-10 items-center gap-1 rounded-2xl border px-3 text-xs font-medium transition-colors',
            terminalOpen
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/25 dark:bg-emerald-400/10 dark:text-emerald-300'
              : 'border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-700 dark:border-cyan-400/15 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-slate-200'
          )}
        >
          <TerminalIcon size={13} />
          <span className="hidden sm:inline">终端</span>
          {terminalOpen ? <ChevronDown size={11} /> : <ChevronUp size={11} />}
        </button>
        </div>
      </div>

      {/* Messages */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 lg:px-2">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 pb-2">
        {!activeSession && (
          <div className="flex h-full flex-col items-center justify-center gap-4 rounded-[24px] border border-dashed border-slate-200 bg-white/52 px-6 py-12 text-center text-slate-500 dark:border-cyan-400/18 dark:bg-slate-950/40">
            <Bot size={40} className="opacity-20" />
            <p className="text-sm">Select or create a session to start chatting</p>
          </div>
        )}

        {activeSession && messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-4 rounded-[24px] border border-dashed border-slate-200 bg-white/52 px-6 py-12 text-center text-slate-500 dark:border-cyan-400/18 dark:bg-slate-950/40">
            <Bot size={40} className="opacity-20" />
            <p className="text-sm">Start a conversation</p>
          </div>
        )}

        {messages.map(msg => (
          <div key={msg.id} className={cn('flex gap-3', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
            {msg.role === 'assistant' && (
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-sky-200 bg-[linear-gradient(135deg,rgba(224,242,254,0.95),rgba(191,219,254,0.9))] text-sky-700 shadow-[0_10px_24px_rgba(148,163,184,0.16)] dark:border-cyan-400/20 dark:bg-[linear-gradient(135deg,rgba(34,211,238,0.28),rgba(59,130,246,0.34))] dark:text-white dark:shadow-[0_10px_24px_rgba(14,165,233,0.18)]">
                <Bot size={14} className="text-white" />
              </div>
            )}
            <div className={cn(
              'max-w-[88%] whitespace-pre-wrap rounded-[22px] px-4 py-3 text-sm leading-6 shadow-sm sm:max-w-[78%]',
              msg.role === 'user'
                ? 'rounded-br-md border border-sky-200 bg-[linear-gradient(135deg,rgba(96,165,250,0.92),rgba(129,140,248,0.9))] text-white shadow-[0_16px_34px_rgba(148,163,184,0.18)] dark:border-cyan-300/18 dark:bg-[linear-gradient(135deg,rgba(14,165,233,0.95),rgba(99,102,241,0.92))] dark:shadow-[0_16px_34px_rgba(37,99,235,0.24)]'
                : 'rounded-bl-md border border-slate-200 bg-white/82 text-slate-700 shadow-[0_10px_30px_rgba(148,163,184,0.14)] dark:border-cyan-400/14 dark:bg-slate-950/78 dark:text-slate-200 dark:shadow-[0_10px_30px_rgba(2,6,23,0.28)]'
            )}>
              <MarkdownMessage content={msg.content} />
              <div className="mt-2 text-right text-[10px] opacity-50">
                {new Date(msg.createdAt).toLocaleTimeString()}
                {msg.model && <span className="ml-1 opacity-70">· {msg.model}</span>}
              </div>
            </div>
            {msg.role === 'user' && (
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white/82 text-slate-500 shadow-sm dark:border-cyan-400/12 dark:bg-slate-950/72 dark:text-slate-300">
                <User size={14} className="text-slate-500 dark:text-slate-300" />
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-sky-200 bg-[linear-gradient(135deg,rgba(224,242,254,0.95),rgba(191,219,254,0.9))] text-sky-700 dark:border-cyan-400/20 dark:bg-[linear-gradient(135deg,rgba(34,211,238,0.28),rgba(59,130,246,0.34))] dark:text-white">
              <Bot size={14} className="text-white" />
            </div>
            <div className="rounded-[22px] rounded-bl-md border border-slate-200 bg-white/82 px-4 py-3 dark:border-cyan-400/14 dark:bg-slate-950/78">
              <Loader2 size={16} className="animate-spin text-indigo-500" />
            </div>
          </div>
        )}

        <div ref={bottomRef} />
        </div>
      </div>

      {/* Input area */}
      <div className="shrink-0 px-3 pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)] pt-1 sm:px-4 sm:pb-[calc(env(safe-area-inset-bottom,0px)+1rem)] lg:px-2 lg:pb-4" ref={inputAreaRef}>
        <div className="mx-auto w-full max-w-4xl">
        {/* Active skills badges */}
        {enabledSkills.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2 px-1">
            {enabledSkills.map(s => (
              <span
                key={s.id}
                className="flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-sky-700 dark:border-cyan-400/18 dark:bg-cyan-400/10 dark:text-cyan-200"
              >
                <Zap size={9} />
                {s.name}
                <button
                  onClick={() => setSkills(skills.map(sk => sk.id === s.id ? { ...sk, enabled: false } : sk))}
                  className="ml-0.5 transition-colors hover:text-red-300"
                >
                  <X size={9} />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Slash command popup */}
        {slashOpen && slashCommands.length > 0 && (
          <div className="mb-2 overflow-hidden rounded-[22px] border border-slate-200 bg-white/94 py-1 shadow-[0_18px_40px_rgba(148,163,184,0.16)] dark:border-cyan-400/16 dark:bg-slate-950/96 dark:shadow-[0_18px_40px_rgba(2,6,23,0.42)]">
            {slashCommands.map((cmd, index) => (
              <button
                key={cmd.id}
                onMouseDown={e => { e.preventDefault(); applySlashCommand(cmd); }}
                className={cn(
                  'w-full flex items-start gap-2 px-3 py-1.5 text-left transition-colors',
                  index === slashIndex
                    ? 'bg-sky-50 text-slate-700 dark:bg-cyan-400/10 dark:text-inherit'
                    : 'hover:bg-slate-50 dark:hover:bg-slate-900/90'
                )}
              >
                <span className="shrink-0 text-xs font-mono font-semibold text-sky-700 dark:text-cyan-300">/{cmd.name}</span>
                <span className="truncate text-[11px] text-slate-500 dark:text-slate-500">{cmd.desc || cmd.prompt}</span>
              </button>
            ))}
          </div>
        )}

        <div className="rounded-[24px] border border-slate-200 bg-white/90 shadow-[0_18px_50px_rgba(148,163,184,0.16)] transition-colors focus-within:border-sky-200 dark:border-cyan-400/16 dark:bg-slate-950/88 dark:shadow-[0_18px_50px_rgba(2,6,23,0.42)] dark:focus-within:border-cyan-300/30">
          <div className="px-4 pt-3">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder={activeSession ? 'Message AI... (/ for commands, Enter to send)' : 'Select or create a session first...'}
              disabled={!activeSession}
              rows={2}
              className="max-h-40 w-full resize-none bg-transparent text-sm leading-6 text-slate-800 outline-none placeholder:text-slate-400 disabled:cursor-not-allowed dark:text-slate-100 dark:placeholder:text-slate-500"
            />
          </div>
          {/* Bottom toolbar */}
          <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 px-3 pb-3 pt-2 dark:border-cyan-400/10 sm:flex-nowrap sm:gap-2.5 sm:px-4">
            {/* Model selector */}
            <div className="relative">
              <button
                onClick={() => { setModelOpen(o => !o); setModeOpen(false); setSkillsOpen(false); }}
                disabled={!activeSession}
                className="flex h-10 items-center gap-1 rounded-2xl border border-slate-200 bg-slate-50/80 px-3 text-[11px] text-slate-700 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-50 dark:border-cyan-400/14 dark:bg-slate-900/88 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                <span>{currentModel.label}</span>
                <ChevronDown size={11} />
              </button>
              {modelOpen && (
                  <div className="absolute bottom-full left-0 z-20 mb-1 w-48 rounded-[20px] border border-slate-200 bg-white/95 py-1 shadow-[0_18px_40px_rgba(148,163,184,0.16)] dark:border-cyan-400/16 dark:bg-slate-950/96 dark:shadow-[0_18px_40px_rgba(2,6,23,0.42)]">
                  {MODELS.map(m => (
                    <button
                      key={m.id}
                      onClick={() => { setSelectedModel(m.id); setModelOpen(false); }}
                      className={cn(
                        'w-full text-left px-3 py-1.5 text-xs transition-colors',
                        m.id === currentModel.id
                          ? 'bg-sky-50 text-sky-700 dark:bg-cyan-400/10 dark:text-cyan-300'
                          : 'text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-900/90'
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
                   'flex h-10 items-center gap-1 rounded-2xl border px-3 text-[11px] transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                   modeColor
                 )}
              >
                <span>{currentModeConfig?.label ?? 'Mode'}</span>
                <ChevronDown size={11} />
              </button>
              {modeOpen && (
                  <div className="absolute bottom-full left-0 z-20 mb-1 w-52 rounded-[20px] border border-slate-200 bg-white/95 py-1 shadow-[0_18px_40px_rgba(148,163,184,0.16)] dark:border-cyan-400/16 dark:bg-slate-950/96 dark:shadow-[0_18px_40px_rgba(2,6,23,0.42)]">
                  {agentModes.map(m => (
                    <button
                      key={m.id}
                      onClick={() => { setActiveMode(m.id); setModeOpen(false); }}
                      className={cn(
                        'w-full text-left px-3 py-1.5 transition-colors',
                        m.id === activeMode
                          ? 'bg-sky-50 text-sky-700 dark:bg-cyan-400/10 dark:text-cyan-300'
                          : 'text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-900/90'
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
                   'flex h-10 items-center gap-1 rounded-2xl border px-3 text-[11px] transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                    enabledSkills.length > 0
                     ? 'border-sky-200 bg-sky-50 text-sky-700 dark:border-cyan-300/22 dark:bg-cyan-400/10 dark:text-cyan-200'
                     : 'border-slate-200 bg-slate-50/80 text-slate-700 hover:bg-white dark:border-cyan-400/14 dark:bg-slate-900/88 dark:text-slate-300 dark:hover:bg-slate-800'
                 )}
               >
                <Zap size={11} />
                <span>技能{enabledSkills.length > 0 ? ` (${enabledSkills.length})` : ''}</span>
                <ChevronDown size={11} />
              </button>
              {skillsOpen && (
                  <div className="absolute bottom-full left-0 z-20 mb-1 w-56 rounded-[20px] border border-slate-200 bg-white/95 py-1 shadow-[0_18px_40px_rgba(148,163,184,0.16)] dark:border-cyan-400/16 dark:bg-slate-950/96 dark:shadow-[0_18px_40px_rgba(2,6,23,0.42)]">
                  {skills.length === 0 && (
                    <div className="px-3 py-2 text-xs text-slate-500 dark:text-slate-500">暂无技能（在设置中添加）</div>
                  )}
                  {skills.map(s => (
                    <label
                      key={s.id}
                      className="flex cursor-pointer items-start gap-2 px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-900/90"
                    >
                      <input
                        type="checkbox"
                        checked={s.enabled}
                        onChange={e => setSkills(skills.map(sk => sk.id === s.id ? { ...sk, enabled: e.target.checked } : sk))}
                        className="mt-0.5 accent-cyan-400"
                      />
                      <div>
                        <div className="text-xs font-medium text-slate-700 dark:text-slate-300">{s.name}</div>
                        <div className="text-[10px] text-slate-500 dark:text-slate-500">{s.desc}</div>
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
              className="ml-auto flex h-11 shrink-0 items-center gap-1.5 rounded-2xl border border-sky-200 bg-[linear-gradient(135deg,rgba(96,165,250,0.95),rgba(129,140,248,0.92))] px-4 text-xs font-medium text-white transition-all hover:-translate-y-px hover:brightness-105 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:bg-none disabled:text-slate-400 dark:border-cyan-300/20 dark:bg-[linear-gradient(135deg,rgba(14,165,233,0.98),rgba(99,102,241,0.96))] dark:hover:brightness-110 dark:disabled:border-slate-700 dark:disabled:bg-slate-800 dark:disabled:text-slate-500"
            >
              <Send size={12} />
              <span className="text-[10px] opacity-80">Enter</span>
            </button>
          </div>
        </div>
        </div>
      </div>

      {/* Terminal panel — bottommost, no inner header, resizable from top edge */}
      {terminalOpen && (
        <div
          className="relative mt-2 flex shrink-0 flex-col overflow-hidden border-t border-slate-200 bg-white/92 dark:border-cyan-400/15 dark:bg-slate-950/94 lg:mx-2 lg:mb-2 lg:rounded-[20px] lg:border lg:border-slate-200 dark:lg:border-cyan-400/14"
          style={{ height: terminalHeight }}
        >
          {/* Resize bar */}
          <div
            onMouseDown={onTermResizeMouseDown}
            className="absolute left-0 right-0 top-0 z-10 h-1 cursor-row-resize transition-colors hover:bg-cyan-300/35"
          />
          <div className="flex-1 overflow-hidden min-h-0">
            <TerminalPanel />
          </div>
        </div>
      )}
    </div>
  );
}
