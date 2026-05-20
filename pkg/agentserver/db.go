package agentserver

import (
	"database/sql"
	"embed"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"time"

	_ "modernc.org/sqlite" // register sqlite driver
)

//go:embed builtin/* builtin/**/* builtin/**/**/*
var builtinFiles embed.FS

const (
	configKindAgent   = "agent"
	configKindCommand = "command"
	configKindSkill   = "skill"
	configKindMCP     = "mcp"
)

type AppPaths struct {
	DataDir      string
	WorkspaceDir string
	TmpDir       string
	DownloadsDir string
	AgentsDir    string
	CommandsDir  string
	SkillsDir    string
	MCPDir       string
	DBPath       string
}

type ConfigItem struct {
	ID        string    `json:"id"`
	Kind      string    `json:"kind"`
	Name      string    `json:"name"`
	Desc      string    `json:"desc,omitempty"`
	Prompt    string    `json:"prompt,omitempty"`
	URL       string    `json:"url,omitempty"`
	Enabled   bool      `json:"enabled"`
	Builtin   bool      `json:"builtin"`
	Source    string    `json:"source,omitempty"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

// DB wraps the SQLite database connection.
type DB struct {
	conn *sql.DB
}

// NewDB opens (or creates) a SQLite database at path and initialises the schema.
func NewDB(path string) (*DB, error) {
	conn, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, err
	}
	conn.SetMaxOpenConns(1)
	if err := initSchema(conn); err != nil {
		conn.Close()
		return nil, err
	}
	return &DB{conn: conn}, nil
}

func (db *DB) Close() error {
	return db.conn.Close()
}

func initSchema(conn *sql.DB) error {
	_, err := conn.Exec(`
CREATE TABLE IF NOT EXISTS projects (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    root_path   TEXT NOT NULL DEFAULT '',
    labels      TEXT NOT NULL DEFAULT '{}',
    created_at  DATETIME NOT NULL,
    updated_at  DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
    id          TEXT PRIMARY KEY,
    project_id  TEXT NOT NULL,
    name        TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    status      TEXT NOT NULL DEFAULT 'active',
    metadata    TEXT NOT NULL DEFAULT '{}',
    model       TEXT NOT NULL DEFAULT '',
    created_at  DATETIME NOT NULL,
    updated_at  DATETIME NOT NULL,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS messages (
    id          TEXT PRIMARY KEY,
    session_id  TEXT NOT NULL,
    role        TEXT NOT NULL,
    content     TEXT NOT NULL,
    model       TEXT NOT NULL DEFAULT '',
    created_at  DATETIME NOT NULL,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS configs (
    id          TEXT PRIMARY KEY,
    kind        TEXT NOT NULL,
    name        TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    prompt      TEXT NOT NULL DEFAULT '',
    url         TEXT NOT NULL DEFAULT '',
    enabled     INTEGER NOT NULL DEFAULT 0,
    builtin     INTEGER NOT NULL DEFAULT 0,
    source      TEXT NOT NULL DEFAULT '',
    created_at  DATETIME NOT NULL,
    updated_at  DATETIME NOT NULL,
    UNIQUE(kind, name)
);
`)
	return err
}

func EnsureAppPaths(cwd, dataDir, workspaceDir, dbPath string) (*AppPaths, error) {
	if dataDir == "" {
		dataDir = filepath.Join(cwd, "data")
	}
	if workspaceDir == "" {
		workspaceDir = filepath.Join(cwd, "workspace")
	}
	if dbPath == "" {
		dbPath = filepath.Join(dataDir, "agent.db")
	}

	absDataDir, err := filepath.Abs(dataDir)
	if err != nil {
		return nil, err
	}
	absWorkspaceDir, err := filepath.Abs(workspaceDir)
	if err != nil {
		return nil, err
	}
	absDBPath, err := filepath.Abs(dbPath)
	if err != nil {
		return nil, err
	}

	paths := &AppPaths{
		DataDir:      absDataDir,
		WorkspaceDir: absWorkspaceDir,
		TmpDir:       filepath.Join(absDataDir, "tmp"),
		DownloadsDir: filepath.Join(absDataDir, "downloads"),
		AgentsDir:    filepath.Join(absDataDir, "agents"),
		CommandsDir:  filepath.Join(absDataDir, "commands"),
		SkillsDir:    filepath.Join(absDataDir, "skills"),
		MCPDir:       filepath.Join(absDataDir, "mcp"),
		DBPath:       absDBPath,
	}
	for _, dir := range []string{paths.DataDir, paths.WorkspaceDir, paths.TmpDir, paths.DownloadsDir, paths.AgentsDir, paths.CommandsDir, paths.SkillsDir, paths.MCPDir, filepath.Dir(paths.DBPath)} {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return nil, err
		}
	}
	return paths, nil
}

func SeedBuiltinConfigs(db *DB, paths *AppPaths) error {
	now := time.Now()
	items := []ConfigItem{
		{ID: "builtin-agent-plan", Kind: configKindAgent, Name: "plan", Desc: "只读规划，不执行任何操作", Enabled: false, Builtin: true, Source: "builtin", CreatedAt: now, UpdatedAt: now},
		{ID: "builtin-agent-auto", Kind: configKindAgent, Name: "auto", Desc: "自动执行，关键步骤确认", Enabled: true, Builtin: true, Source: "builtin", CreatedAt: now, UpdatedAt: now},
		{ID: "builtin-agent-yolo", Kind: configKindAgent, Name: "yolo", Desc: "完全自主，无需确认", Prompt: "You are in full autonomous mode. Execute all tasks without asking for confirmation.", Enabled: false, Builtin: true, Source: "builtin", CreatedAt: now, UpdatedAt: now},
		{ID: "builtin-command-fix", Kind: configKindCommand, Name: "fix", Desc: "修复指定问题", Prompt: "Fix the following issue: {% ARGUMENT %}", Enabled: true, Builtin: true, Source: "builtin", CreatedAt: now, UpdatedAt: now},
		{ID: "builtin-command-explain", Kind: configKindCommand, Name: "explain", Desc: "用简单语言解释内容", Prompt: "Explain the following in simple terms: {% ARGUMENT %}", Enabled: true, Builtin: true, Source: "builtin", CreatedAt: now, UpdatedAt: now},
		{ID: "builtin-skill-code-review", Kind: configKindSkill, Name: "Code Review", Desc: "审查代码质量、bug 和最佳实践", Prompt: "Review this code for bugs, performance issues, and best practices.", Enabled: false, Builtin: true, Source: "builtin", CreatedAt: now, UpdatedAt: now},
		{ID: "builtin-skill-write-tests", Kind: configKindSkill, Name: "Write Tests", Desc: "为代码编写单元测试", Prompt: "Write comprehensive unit tests for the following code.", Enabled: false, Builtin: true, Source: "builtin", CreatedAt: now, UpdatedAt: now},
	}
	prompts, err := syncBuiltinAgents(paths)
	if err != nil {
		return err
	}
	for i := range items {
		if items[i].Kind == configKindAgent {
			if prompt, ok := prompts[strings.ToLower(items[i].Name)]; ok {
				items[i].Prompt = prompt
			}
		}
		if err := db.UpsertConfig(items[i]); err != nil {
			return err
		}
	}
	return nil
}

func syncBuiltinAgents(paths *AppPaths) (map[string]string, error) {
	root := "builtin/agents"
	entries, err := fs.ReadDir(builtinFiles, root)
	if err != nil {
		return nil, err
	}
	prompts := make(map[string]string, len(entries))
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		name := entry.Name()
		relPrompt := filepath.ToSlash(filepath.Join(root, name, "prompt.txt"))
		data, err := builtinFiles.ReadFile(relPrompt)
		if err != nil {
			return nil, err
		}
		targetDir := filepath.Join(paths.AgentsDir, name)
		if err := os.MkdirAll(targetDir, 0o755); err != nil {
			return nil, err
		}
		if err := os.WriteFile(filepath.Join(targetDir, "prompt.txt"), data, 0o644); err != nil {
			return nil, err
		}
		prompts[name] = string(data)
	}
	return prompts, nil
}

// ── Projects ──────────────────────────────────────────────────────────────

func (db *DB) InsertProject(p *Project) error {
	_, err := db.conn.Exec(
		`INSERT INTO projects (id, name, description, root_path, labels, created_at, updated_at) VALUES (?,?,?,?,?,?,?)`,
		p.ID, p.Name, strOrEmpty(p.Description), strOrEmpty(p.RootPath), jsonStringMap(p.Labels),
		p.CreatedAt.UTC().Format(time.RFC3339Nano),
		p.UpdatedAt.UTC().Format(time.RFC3339Nano),
	)
	return err
}

func (db *DB) UpdateProject(p *Project) error {
	_, err := db.conn.Exec(
		`UPDATE projects SET name=?, description=?, root_path=?, labels=?, updated_at=? WHERE id=?`,
		p.Name, strOrEmpty(p.Description), strOrEmpty(p.RootPath), jsonStringMap(p.Labels),
		p.UpdatedAt.UTC().Format(time.RFC3339Nano), p.ID,
	)
	return err
}

func (db *DB) DeleteProject(id string) error {
	_, err := db.conn.Exec(`DELETE FROM projects WHERE id=?`, id)
	return err
}

func (db *DB) GetProject(id string) (*Project, error) {
	row := db.conn.QueryRow(`SELECT id, name, description, root_path, labels, created_at, updated_at FROM projects WHERE id=?`, id)
	return scanProject(row)
}

func (db *DB) ListProjects() ([]*Project, error) {
	rows, err := db.conn.Query(`SELECT id, name, description, root_path, labels, created_at, updated_at FROM projects ORDER BY created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var items []*Project
	for rows.Next() {
		p, err := scanProject(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, p)
	}
	return items, rows.Err()
}

// ── Sessions ──────────────────────────────────────────────────────────────

func (db *DB) InsertSession(s *Session) error {
	_, err := db.conn.Exec(
		`INSERT INTO sessions (id, project_id, name, description, status, metadata, model, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)`,
		s.ID, s.ProjectID, s.Name, strOrEmpty(s.Description), s.Status,
		jsonStringMap(s.Metadata), strOrEmpty(s.Model),
		s.CreatedAt.UTC().Format(time.RFC3339Nano),
		s.UpdatedAt.UTC().Format(time.RFC3339Nano),
	)
	return err
}

func (db *DB) UpdateSession(s *Session) error {
	_, err := db.conn.Exec(
		`UPDATE sessions SET name=?, description=?, status=?, metadata=?, model=?, updated_at=? WHERE id=?`,
		s.Name, strOrEmpty(s.Description), s.Status, jsonStringMap(s.Metadata), strOrEmpty(s.Model),
		s.UpdatedAt.UTC().Format(time.RFC3339Nano), s.ID,
	)
	return err
}

func (db *DB) DeleteSession(id string) error {
	_, err := db.conn.Exec(`DELETE FROM sessions WHERE id=?`, id)
	return err
}

func (db *DB) DeleteSessionsByProject(projectID string) error {
	_, err := db.conn.Exec(`DELETE FROM sessions WHERE project_id=?`, projectID)
	return err
}

func (db *DB) GetSession(id string) (*Session, error) {
	row := db.conn.QueryRow(`SELECT id, project_id, name, description, status, metadata, model, created_at, updated_at FROM sessions WHERE id=?`, id)
	return scanSession(row)
}

func (db *DB) ListSessions(projectID string) ([]*Session, error) {
	rows, err := db.conn.Query(
		`SELECT id, project_id, name, description, status, metadata, model, created_at, updated_at FROM sessions WHERE project_id=? ORDER BY created_at DESC`,
		projectID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var items []*Session
	for rows.Next() {
		s, err := scanSession(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, s)
	}
	return items, rows.Err()
}

// ── Messages ──────────────────────────────────────────────────────────────

func (db *DB) InsertMessage(m *Message) error {
	_, err := db.conn.Exec(
		`INSERT INTO messages (id, session_id, role, content, model, created_at) VALUES (?,?,?,?,?,?)`,
		m.ID, m.SessionID, m.Role, m.Content, strOrEmpty(m.Model),
		m.CreatedAt.UTC().Format(time.RFC3339Nano),
	)
	return err
}

func (db *DB) ListMessages(sessionID string) ([]*Message, error) {
	rows, err := db.conn.Query(
		`SELECT id, session_id, role, content, model, created_at FROM messages WHERE session_id=? ORDER BY created_at ASC`,
		sessionID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var items []*Message
	for rows.Next() {
		m, err := scanMessage(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, m)
	}
	return items, rows.Err()
}

func (db *DB) DeleteMessagesBySession(sessionID string) error {
	_, err := db.conn.Exec(`DELETE FROM messages WHERE session_id=?`, sessionID)
	return err
}

// ── Configs ───────────────────────────────────────────────────────────────

func (db *DB) UpsertConfig(item ConfigItem) error {
	if item.ID == "" {
		item.ID = fmt.Sprintf("%s-%s", item.Kind, item.Name)
	}
	if item.CreatedAt.IsZero() {
		item.CreatedAt = time.Now()
	}
	if item.UpdatedAt.IsZero() {
		item.UpdatedAt = item.CreatedAt
	}
	_, err := db.conn.Exec(
		`INSERT INTO configs (id, kind, name, description, prompt, url, enabled, builtin, source, created_at, updated_at)
		 VALUES (?,?,?,?,?,?,?,?,?,?,?)
		 ON CONFLICT(kind, name) DO UPDATE SET
		 description=excluded.description,
		 prompt=excluded.prompt,
		 url=excluded.url,
		 enabled=excluded.enabled,
		 builtin=excluded.builtin,
		 source=excluded.source,
		 updated_at=excluded.updated_at`,
		item.ID,
		item.Kind,
		item.Name,
		strOrEmpty(item.Desc),
		strOrEmpty(item.Prompt),
		strOrEmpty(item.URL),
		boolToInt(item.Enabled),
		boolToInt(item.Builtin),
		strOrEmpty(item.Source),
		item.CreatedAt.UTC().Format(time.RFC3339Nano),
		item.UpdatedAt.UTC().Format(time.RFC3339Nano),
	)
	return err
}

func (db *DB) ListConfigs(kind string) ([]ConfigItem, error) {
	rows, err := db.conn.Query(`SELECT id, kind, name, description, prompt, url, enabled, builtin, source, created_at, updated_at FROM configs WHERE kind=? ORDER BY builtin DESC, created_at ASC`, kind)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var items []ConfigItem
	for rows.Next() {
		item, err := scanConfig(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (db *DB) DeleteConfig(kind, id string) error {
	_, err := db.conn.Exec(`DELETE FROM configs WHERE kind=? AND id=?`, kind, id)
	return err
}

// ── scan helpers ──────────────────────────────────────────────────────────

type scanner interface {
	Scan(dest ...any) error
}

func scanProject(s scanner) (*Project, error) {
	var p Project
	var labelsStr, createdStr, updatedStr string
	var desc, rootPath string
	if err := s.Scan(&p.ID, &p.Name, &desc, &rootPath, &labelsStr, &createdStr, &updatedStr); err != nil {
		return nil, err
	}
	p.Description = desc
	p.RootPath = rootPath
	p.Labels = parseStringMap(labelsStr)
	p.CreatedAt, _ = time.Parse(time.RFC3339Nano, createdStr)
	p.UpdatedAt, _ = time.Parse(time.RFC3339Nano, updatedStr)
	return &p, nil
}

func scanSession(s scanner) (*Session, error) {
	var sess Session
	var metaStr, createdStr, updatedStr string
	var desc, model string
	if err := s.Scan(&sess.ID, &sess.ProjectID, &sess.Name, &desc, &sess.Status, &metaStr, &model, &createdStr, &updatedStr); err != nil {
		return nil, err
	}
	sess.Description = desc
	sess.Model = model
	sess.Metadata = parseStringMap(metaStr)
	sess.CreatedAt, _ = time.Parse(time.RFC3339Nano, createdStr)
	sess.UpdatedAt, _ = time.Parse(time.RFC3339Nano, updatedStr)
	return &sess, nil
}

func scanMessage(s scanner) (*Message, error) {
	var m Message
	var createdStr, model string
	if err := s.Scan(&m.ID, &m.SessionID, &m.Role, &m.Content, &model, &createdStr); err != nil {
		return nil, err
	}
	m.Model = model
	m.CreatedAt, _ = time.Parse(time.RFC3339Nano, createdStr)
	return &m, nil
}

func scanConfig(s scanner) (ConfigItem, error) {
	var item ConfigItem
	var createdStr, updatedStr string
	var enabled, builtin int
	if err := s.Scan(&item.ID, &item.Kind, &item.Name, &item.Desc, &item.Prompt, &item.URL, &enabled, &builtin, &item.Source, &createdStr, &updatedStr); err != nil {
		return ConfigItem{}, err
	}
	item.Enabled = enabled != 0
	item.Builtin = builtin != 0
	item.CreatedAt, _ = time.Parse(time.RFC3339Nano, createdStr)
	item.UpdatedAt, _ = time.Parse(time.RFC3339Nano, updatedStr)
	return item, nil
}
