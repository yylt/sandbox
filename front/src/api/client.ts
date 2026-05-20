import type {
  Project, ProjectRequest, ProjectListResponse,
  Session, SessionRequest, SessionListResponse,
  Message, MessageRequest, MessageListResponse,
  FileListResponse, FileCreateRequest, FileEntry, FileContentRequest, FileContentResponse,
  GitStatusResponse, GitBranchListResponse, GitDiffResponse,
  GitCommitRequest, GitCommitResponse, GitCheckoutRequest,
  Terminal, TerminalCreateRequest, TerminalListResponse, TerminalResizeRequest,
  WorkdirListResponse, ConfigListResponse, ConfigItem, ConfigCreateRequest, ConfigScanRequest, ConfigScanResponse,
} from './types';

const BASE = '/api/v1';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(options?.headers ?? {}) },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message ?? res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

// ── Workdir ───────────────────────────────────────────────────────────────
export const workdirApi = {
  list: (): Promise<WorkdirListResponse> => request(`${BASE}/workdir/list`),
};

export const configApi = {
  list: (kind: 'agents' | 'commands' | 'skills' | 'mcp'): Promise<ConfigListResponse> =>
    request(`${BASE}/config/${kind}`),
  create: (kind: 'agents' | 'commands' | 'skills' | 'mcp', body: ConfigCreateRequest): Promise<ConfigItem> =>
    request(`${BASE}/config/${kind}`, { method: 'POST', body: JSON.stringify(body) }),
  delete: (kind: 'agents' | 'commands' | 'skills' | 'mcp', id: string): Promise<void> =>
    request(`${BASE}/config/${kind}/${id}`, { method: 'DELETE' }),
  scan: (kind: 'agents' | 'commands' | 'skills' | 'mcp', body: ConfigScanRequest): Promise<ConfigScanResponse> =>
    request(`${BASE}/config/${kind}/scan`, { method: 'POST', body: JSON.stringify(body) }),
};

// ── Projects ──────────────────────────────────────────────────────────────
export const projectsApi = {
  list: (): Promise<ProjectListResponse> => request(`${BASE}/projects`),
  create: (body: ProjectRequest): Promise<Project> =>
    request(`${BASE}/projects`, { method: 'POST', body: JSON.stringify(body) }),
  get: (id: string): Promise<Project> => request(`${BASE}/projects/${id}`),
  update: (id: string, body: ProjectRequest): Promise<Project> =>
    request(`${BASE}/projects/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  delete: (id: string): Promise<void> =>
    request(`${BASE}/projects/${id}`, { method: 'DELETE' }),
};

// ── Sessions ──────────────────────────────────────────────────────────────
export const sessionsApi = {
  list: (projectId: string): Promise<SessionListResponse> =>
    request(`${BASE}/projects/${projectId}/sessions`),
  create: (projectId: string, body: SessionRequest): Promise<Session> =>
    request(`${BASE}/projects/${projectId}/sessions`, { method: 'POST', body: JSON.stringify(body) }),
  get: (projectId: string, sessionId: string): Promise<Session> =>
    request(`${BASE}/projects/${projectId}/sessions/${sessionId}`),
  update: (projectId: string, sessionId: string, body: SessionRequest): Promise<Session> =>
    request(`${BASE}/projects/${projectId}/sessions/${sessionId}`, { method: 'PUT', body: JSON.stringify(body) }),
  delete: (projectId: string, sessionId: string): Promise<void> =>
    request(`${BASE}/projects/${projectId}/sessions/${sessionId}`, { method: 'DELETE' }),
  deleteAll: (projectId: string): Promise<void> =>
    request(`${BASE}/projects/${projectId}/sessions`, { method: 'DELETE' }),
};

// ── Messages ──────────────────────────────────────────────────────────────
export const messagesApi = {
  list: (sessionId: string): Promise<MessageListResponse> =>
    request(`${BASE}/sessions/${sessionId}/messages`),
  create: (sessionId: string, body: MessageRequest): Promise<Message> =>
    request(`${BASE}/sessions/${sessionId}/messages`, { method: 'POST', body: JSON.stringify(body) }),
  deleteAll: (sessionId: string): Promise<void> =>
    request(`${BASE}/sessions/${sessionId}/messages`, { method: 'DELETE' }),
};

// ── Files ─────────────────────────────────────────────────────────────────
export const filesApi = {
  list: (path: string, confirm = false): Promise<FileListResponse> =>
    request(`${BASE}/files?path=${encodeURIComponent(path)}&confirm=${confirm}`),
  create: (body: FileCreateRequest): Promise<FileEntry> =>
    request(`${BASE}/files`, { method: 'POST', body: JSON.stringify(body) }),
  delete: (path: string, recursive = false, confirm = false): Promise<void> =>
    request(`${BASE}/files?path=${encodeURIComponent(path)}&recursive=${recursive}&confirm=${confirm}`, { method: 'DELETE' }),
  readContent: (path: string, confirm = false): Promise<FileContentResponse> =>
    request(`${BASE}/files/content?path=${encodeURIComponent(path)}&confirm=${confirm}`),
  writeContent: (body: FileContentRequest): Promise<FileEntry> =>
    request(`${BASE}/files/content`, { method: 'PUT', body: JSON.stringify(body) }),
};

// ── Git ───────────────────────────────────────────────────────────────────
export const gitApi = {
  status: (repoPath: string): Promise<GitStatusResponse> =>
    request(`${BASE}/git/status?repoPath=${encodeURIComponent(repoPath)}`),
  branches: (repoPath: string): Promise<GitBranchListResponse> =>
    request(`${BASE}/git/branches?repoPath=${encodeURIComponent(repoPath)}`),
  diff: (repoPath: string, filePath?: string, staged = false): Promise<GitDiffResponse> => {
    let url = `${BASE}/git/diff?repoPath=${encodeURIComponent(repoPath)}&staged=${staged}`;
    if (filePath) url += `&filePath=${encodeURIComponent(filePath)}`;
    return request(url);
  },
  commit: (body: GitCommitRequest): Promise<GitCommitResponse> =>
    request(`${BASE}/git/commit`, { method: 'POST', body: JSON.stringify(body) }),
  checkout: (body: GitCheckoutRequest): Promise<GitStatusResponse> =>
    request(`${BASE}/git/checkout`, { method: 'POST', body: JSON.stringify(body) }),
  stage: (repoPath: string, path: string): Promise<void> =>
    request(`${BASE}/git/stage`, { method: 'POST', body: JSON.stringify({ repoPath, path }) }),
};

// ── Terminals ─────────────────────────────────────────────────────────────
export const terminalsApi = {
  list: (): Promise<TerminalListResponse> => request(`${BASE}/terminals`),
  create: (body: TerminalCreateRequest): Promise<Terminal> =>
    request(`${BASE}/terminals`, { method: 'POST', body: JSON.stringify(body) }),
  get: (id: string): Promise<Terminal> => request(`${BASE}/terminals/${id}`),
  delete: (id: string): Promise<void> =>
    request(`${BASE}/terminals/${id}`, { method: 'DELETE' }),
  resize: (id: string, body: TerminalResizeRequest): Promise<void> =>
    request(`${BASE}/terminals/${id}/resize`, { method: 'POST', body: JSON.stringify(body) }),
  wsUrl: (id: string): string => {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    return `${proto}://${location.host}/api/v1/terminals/${id}/ws`;
  },
};
