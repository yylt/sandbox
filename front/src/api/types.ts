export interface ErrorResponse {
  code: number;
  message: string;
}

export interface ConfigItem {
  id: string;
  kind: string;
  name: string;
  desc?: string;
  prompt?: string;
  url?: string;
  enabled: boolean;
  builtin: boolean;
  source?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ConfigListResponse {
  items: ConfigItem[];
  total: number;
}

export interface ConfigCreateRequest {
  name: string;
  desc?: string;
  prompt?: string;
  url?: string;
  enabled?: boolean;
  candidate?: string;
}

export interface ConfigScanRequest {
  url: string;
}

export interface InstallableConfigItem {
  name: string;
  desc?: string;
  prompt?: string;
  selected: boolean;
  sourceUrl?: string;
}

export interface ConfigScanResponse {
  items: InstallableConfigItem[];
  total: number;
}

// ── Projects ──────────────────────────────────────────────────────────────
export interface ProjectRequest {
  name: string;
  description?: string;
  rootPath?: string;
  labels?: Record<string, string>;
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  rootPath?: string;
  labels?: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectListResponse {
  items: Project[];
  total?: number;
}

// ── Sessions ──────────────────────────────────────────────────────────────
export interface SessionRequest {
  name: string;
  description?: string;
  model?: string;
  metadata?: Record<string, string>;
}

export interface Session {
  id: string;
  projectId: string;
  name: string;
  description?: string;
  status: 'active' | 'idle' | 'terminated';
  model?: string;
  metadata?: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export interface SessionListResponse {
  items: Session[];
  total?: number;
}

// ── Messages ──────────────────────────────────────────────────────────────
export interface MessageRequest {
  role: 'user' | 'assistant';
  content: string;
  model?: string;
}

export interface Message {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant';
  content: string;
  model?: string;
  createdAt: string;
}

export interface MessageListResponse {
  items: Message[];
  total?: number;
}

// ── Files ─────────────────────────────────────────────────────────────────
export interface FileEntry {
  name: string;
  path: string;
  type: 'file' | 'directory' | 'symlink';
  size?: number;
  modifiedAt?: string;
  permissions?: string;
}

export interface FileListResponse {
  path: string;
  entries: FileEntry[];
}

export interface FileCreateRequest {
  path: string;
  type: 'file' | 'directory';
  content?: string;
  permissions?: string;
  confirm?: boolean;
}

export interface FileContentRequest {
  path: string;
  content: string;
  encoding?: 'base64' | 'utf8';
  confirm?: boolean;
}

export interface FileContentResponse {
  path: string;
  content: string;
  encoding: 'base64' | 'utf8';
  size?: number;
}

// ── Git ───────────────────────────────────────────────────────────────────
export interface GitFileStatus {
  path: string;
  status: 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked' | 'conflicted';
  oldPath?: string;
}

export interface GitStatusResponse {
  repoPath: string;
  branch: string;
  clean: boolean;
  ahead?: number;
  behind?: number;
  staged: GitFileStatus[];
  unstaged: GitFileStatus[];
  untracked: string[];
}

export interface GitBranch {
  name: string;
  current: boolean;
  remote?: string;
  lastCommit?: string;
}

export interface GitBranchListResponse {
  branches: GitBranch[];
}

export interface GitDiffResponse {
  repoPath: string;
  filePath?: string;
  diff: string;
}

export interface GitCommitRequest {
  repoPath: string;
  message: string;
  paths?: string[];
  authorName?: string;
  authorEmail?: string;
}

export interface GitCommitResponse {
  commitHash: string;
  message: string;
  author: string;
  committedAt: string;
}

export interface GitCheckoutRequest {
  repoPath: string;
  branch: string;
  createNew?: boolean;
}

// ── Terminals ─────────────────────────────────────────────────────────────
export interface TerminalCreateRequest {
  shell?: string;
  cwd?: string;
  env?: Record<string, string>;
  cols?: number;
  rows?: number;
}

export interface Terminal {
  id: string;
  shell?: string;
  cwd?: string;
  status: 'running' | 'exited';
  cols: number;
  rows: number;
  pid?: number;
  createdAt: string;
}

export interface TerminalListResponse {
  items: Terminal[];
}

export interface TerminalResizeRequest {
  cols: number;
  rows: number;
}

// ── Workdir ───────────────────────────────────────────────────────────────
export interface WorkdirEntry {
  name: string;
  path: string;
}

export interface WorkdirListResponse {
  root: string;
  items: WorkdirEntry[];
}
