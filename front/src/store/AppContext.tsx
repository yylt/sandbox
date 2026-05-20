import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import type { Project, Session, Message, ConfigItem } from '../api/types';
import { configApi } from '../api/client';

export interface InstallableItem {
  name: string;
  desc: string;
  prompt: string;
  selected: boolean;
  sourceUrl?: string;
}

export type Theme = 'light' | 'dark';

export interface WorkdirEntry {
  name: string;
  path: string;
}

export interface AgentModeConfig {
  id: string;
  label: string;
  desc: string;
  prompt: string;
  builtin?: boolean;
  source?: string;
}

export interface SlashCommand {
  id: string;
  name: string;
  desc: string;
  prompt: string;
  builtin?: boolean;
  source?: string;
}

export interface Skill {
  id: string;
  name: string;
  desc: string;
  prompt: string;
  enabled: boolean;
  source?: string;
  builtin?: boolean;
}

export interface McpServer {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  description?: string;
  builtin?: boolean;
  source?: string;
}

interface AppState {
  theme: Theme;
  toggleTheme: () => void;
  agentModes: AgentModeConfig[];
  setAgentModes: (modes: AgentModeConfig[]) => void;
  activeMode: string;
  setActiveMode: (id: string) => void;
  slashCommands: SlashCommand[];
  setSlashCommands: (cmds: SlashCommand[]) => void;
  skills: Skill[];
  setSkills: (skills: Skill[]) => void;
  mcpServers: McpServer[];
  setMcpServers: (servers: McpServer[]) => void;
  installableItems: InstallableItem[];
  setInstallableItems: (items: InstallableItem[]) => void;
  sourceUrl: string;
  setSourceUrl: (url: string) => void;
  workdirEntries: WorkdirEntry[];
  setWorkdirEntries: (entries: WorkdirEntry[]) => void;
  projects: Project[];
  activeProject: Project | null;
  sessions: Session[];
  activeSession: Session | null;
  messages: Message[];
  selectedModel: string;
  setProjects: (p: Project[]) => void;
  setActiveProject: (p: Project | null) => void;
  setSessions: (s: Session[] | ((prev: Session[]) => Session[])) => void;
  setActiveSession: (s: Session | null) => void;
  setMessages: (m: Message[]) => void;
  appendMessage: (m: Message) => void;
  setSelectedModel: (model: string) => void;
}

const AppCtx = createContext<AppState | null>(null);

function mapAgent(item: ConfigItem): AgentModeConfig {
  return {
    id: item.id,
    label: item.name,
    desc: item.desc ?? '',
    prompt: item.prompt ?? '',
    builtin: item.builtin,
    source: item.source,
  };
}

function mapCommand(item: ConfigItem): SlashCommand {
  return {
    id: item.id,
    name: item.name,
    desc: item.desc ?? '',
    prompt: item.prompt ?? '',
    builtin: item.builtin,
    source: item.source,
  };
}

function mapSkill(item: ConfigItem): Skill {
  return {
    id: item.id,
    name: item.name,
    desc: item.desc ?? '',
    prompt: item.prompt ?? '',
    enabled: item.enabled,
    source: item.source,
    builtin: item.builtin,
  };
}

function mapMcp(item: ConfigItem): McpServer {
  return {
    id: item.id,
    name: item.name,
    url: item.url ?? '',
    enabled: item.enabled,
    description: item.desc ?? '',
    builtin: item.builtin,
    source: item.source,
  };
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>('light');
  const [agentModes, setAgentModes] = useState<AgentModeConfig[]>([]);
  const [activeMode, setActiveMode] = useState<string>('');
  const [slashCommands, setSlashCommands] = useState<SlashCommand[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [mcpServers, setMcpServers] = useState<McpServer[]>([]);
  const [installableItems, setInstallableItems] = useState<InstallableItem[]>([]);
  const [sourceUrl, setSourceUrl] = useState<string>('');
  const [workdirEntries, setWorkdirEntries] = useState<WorkdirEntry[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSession, setActiveSession] = useState<Session | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('');

  useEffect(() => {
    Promise.all([
      configApi.list('agents'),
      configApi.list('commands'),
      configApi.list('skills'),
      configApi.list('mcp'),
    ]).then(([agents, commands, loadedSkills, mcp]) => {
      const nextModes = agents.items.map(mapAgent);
      const nextCommands = commands.items.map(mapCommand);
      const nextSkills = loadedSkills.items.map(mapSkill);
      const nextMcp = mcp.items.map(mapMcp);
      setAgentModes(nextModes);
      setSlashCommands(nextCommands);
      setSkills(nextSkills);
      setMcpServers(nextMcp);
      setActiveMode(prev => prev || nextModes[0]?.id || '');
    }).catch(() => {
      setAgentModes([]);
      setSlashCommands([]);
      setSkills([]);
      setMcpServers([]);
    });
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(t => (t === 'light' ? 'dark' : 'light'));
  }, []);

  const handleSetActiveProject = useCallback((p: Project | null) => {
    setActiveProject(p);
    setSessions([]);
    setActiveSession(null);
    setMessages([]);
  }, []);

  const handleSetActiveSession = useCallback((s: Session | null) => {
    setActiveSession(s);
    setMessages([]);
    if (s?.model) setSelectedModel(s.model);
  }, []);

  const appendMessage = useCallback((m: Message) => {
    setMessages(prev => [...prev, m]);
  }, []);

  return (
    <AppCtx.Provider value={{
      theme, toggleTheme,
      agentModes, setAgentModes,
      activeMode, setActiveMode,
      slashCommands, setSlashCommands,
      skills, setSkills,
      mcpServers, setMcpServers,
      installableItems, setInstallableItems,
      sourceUrl, setSourceUrl,
      workdirEntries, setWorkdirEntries,
      projects, activeProject, sessions, activeSession,
      messages, selectedModel,
      setProjects, setActiveProject: handleSetActiveProject,
      setSessions, setActiveSession: handleSetActiveSession,
      setMessages, appendMessage, setSelectedModel,
    }}>
      {children}
    </AppCtx.Provider>
  );
}

export function useAppStore() {
  const ctx = useContext(AppCtx);
  if (!ctx) throw new Error('useAppStore must be used within AppProvider');
  return ctx;
}
