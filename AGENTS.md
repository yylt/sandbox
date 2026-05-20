# AGENTS.md

## Repo Shape
- Go module: `github.com/yylt/agentsandbox`.
- Main controller binary entrypoint is `cmd/controller/main.go`.
- Agent HTTP server entrypoint is `cmd/agent/main.go` (see [cmd/agent](#cmdagent) below).
- Agent HTTP server implementation lives under `pkg/agentserver`.
- Agent core LLM control flow should live under `pkg/core`.
- Current handwritten code is concentrated in `internal/log`.
- Protobuf source lives in `api/proto`; generated Go code is written under `internal/pkg/api/pb`, and OpenAPI output goes to `api/openapi`.

## cmd/agent

### Overview
`cmd/agent` is a lightweight HTTP API server (Gin-based) that backs the sandbox frontend. It exposes REST endpoints for project/session management, file operations, git operations, terminal multiplexing, and workdir discovery.

### Directory Layout
```
cmd/agent/
├── main.go                  # entrypoint; flag parsing, router setup, SPA static serving
└── swagger/
    └── openapi.yaml         # OpenAPI spec (embedded into binary via //go:embed)

pkg/agentserver/
├── db.go                    # SQLite database layer (projects/sessions/messages persistence)
├── projects.go              # SQLite-backed project CRUD  — /api/v1/projects
├── sessions.go              # SQLite-backed session CRUD  — /api/v1/projects/:projectId/sessions
├── messages.go              # conversation history CRUD   — /api/v1/sessions/:sessionId/messages
├── files.go                 # filesystem read/write   — /api/v1/files
├── git.go                   # git operations via exec — /api/v1/git
├── terminals.go             # WebSocket shell mux     — /api/v1/terminals
├── workdir.go               # workdir listing         — /api/v1/workdir/list
└── util.go                  # shared helpers (base64 encode/decode, json map helpers)
```

### CLI Flags
| Flag | Default | Description |
|------|---------|-------------|
| `--ui-dir` | `""` | Path to a Vite-built frontend `dist/` directory to serve as SPA. If empty, frontend is not served. |
| `--data-dir` | `cwd + /data` | Stores agent SQLite DB, temp files, downloads, and persisted config folders (`agents/`, `commands/`, `skills/`, `mcp/`). |
| `--workspace-dir` | `cwd + /workspace` | Root directory whose immediate subdirectories are returned by `/api/v1/workdir/list`. |
| `--db` | `data-dir/agent.db` | Path to the SQLite database file for persisting projects, sessions, messages, and config catalog data. |

Environment variable `AGENT_HTTP_ADDR` controls the listen address (default `:8080`).
`LOG_LEVEL` controls log verbosity.

### Running
```bash
go run ./cmd/agent/main.go --workspace-dir /path/to/projects --ui-dir ./front/dist
```

### API Endpoints
| Method | Path | Handler | Notes |
|--------|------|---------|-------|
| GET | `/healthz` | inline | liveness probe |
| GET | `/readyz` | inline | readiness probe |
| GET | `/api/v1/ping` | inline | sanity check |
| GET | `/api/v1/workdir/list` | `WorkdirHandler` | lists subdirs of `--workspace-dir`; returns `{root, items:[{name,path}]}` |
| GET/POST/PUT/DELETE | `/api/v1/projects[/:id]` | `ProjectStore` | SQLite-backed project CRUD |
| GET/POST/PUT/DELETE | `/api/v1/projects/:projectId/sessions[/:id]` | `SessionStore` | SQLite-backed session CRUD; `DELETE` without id clears all sessions in project |
| GET/POST/DELETE | `/api/v1/sessions/:sessionId/messages` | `MessagesHandler` | conversation message CRUD (role/content/model) |
| GET/POST/DELETE | `/api/v1/files` | `FilesHandler` | list dir / create file or dir / delete |
| GET/PUT | `/api/v1/files/content` | `FilesHandler` | read / write file content (UTF-8 or base64); access outside workspace requires explicit confirm |
| GET/POST/DELETE | `/api/v1/config/:kind` | `catalogHandler` | lists and mutates `agents` / `commands` / `skills` / `mcp` config items stored in DB/data-dir |
| POST | `/api/v1/config/:kind/scan` | `catalogHandler` | clones git repo into `data/downloads`, validates root `agents/commands/skills/mcp` dir, scans install candidates |
| GET | `/api/v1/git/status` | `GitHandler` | porcelain status + ahead/behind |
| GET | `/api/v1/git/branches` | `GitHandler` | branch list |
| GET | `/api/v1/git/diff` | `GitHandler` | unified diff (staged or unstaged) |
| POST | `/api/v1/git/commit` | `GitHandler` | stage + commit |
| POST | `/api/v1/git/checkout` | `GitHandler` | checkout / create branch |
| GET/POST/DELETE | `/api/v1/terminals[/:id]` | `TerminalStore` | terminal lifecycle |
| POST | `/api/v1/terminals/:id/resize` | `TerminalStore` | resize pty cols/rows |
| GET (WS) | `/api/v1/terminals/:id/ws` | `TerminalStore` | WebSocket shell; frames `{type:"input"/"output", data:<base64>}` |
| GET | `/swagger/*` | embedded FS | Swagger UI assets |
| * | `/*` (fallback) | SPA | serves `index.html` for client-side routing (only when `--ui-dir` is set) |

### Adding a New Handler
1. Create `pkg/agentserver/<name>.go` with a struct that implements `RegisterRoutes(gin.IRouter)`.
2. Instantiate and register it in `cmd/agent/main.go` alongside the existing handlers.
3. All state must be persisted via the `*DB` handle; pass `db` to the constructor. Use `sync.RWMutex` only for in-memory caches if needed.
4. Update `cmd/agent/swagger/openapi.yaml` to document the new routes.
5. Compile-check: `go build ./cmd/agent/...`.

## Commands
- Use `make help` to discover repo targets.
- Initial repo setup is `make all`; it sets `core.hooksPath` to `.githooks/`, installs codegen tools into `bin/`, runs protobuf generation, and runs `go mod tidy`.
- Run the controller with `make run` or `go run ./cmd/controller/main.go`.
- Run the agent with `go run ./cmd/agent/main.go`.
- Main verification commands:
- `make lint` runs `fmt`, `go mod download`, then `golangci-lint`.
- `make protolint` lints protobufs.
- `make protobreaking` checks protobuf compatibility against `main`.
- `make test` runs `go test $(ARGS) ./...`.
- `make govulncheck` runs vulnerability scanning.
- CI order is effectively: `make lint` -> `make protolint` -> `make protobreaking` -> `make test` -> `make govulncheck`.

## Testing And Focused Checks
- For a focused Go test, prefer `make test ARGS='-run TestName -count=1'`.
- For compile-only verification, use `make test-build`.
- `make test-reports` and `make lint-reports` write outputs under `out/`.

## Generated Code
- Builtin agent prompts under `pkg/agentserver/builtin/agents/*/prompt.txt` are embedded into the agent binary and synchronized into `data-dir/agents/<name>/prompt.txt` during startup initialization.
- Current embedded builtin agent modes include `plan` and `auto`; their prompt content is written or updated on each startup before builtin configs are seeded into SQLite.
- If you change anything under `api/proto`, run `make generate`.
- `make generate` depends on Buf and protoc plugins installed into the repo-local `bin/` directory.
- `api/proto/buf.lock` is updated via `make generate` / Buf targets; do not hand-edit it.

## Workflow Gotchas
- The repo uses a custom pre-push hook in `.githooks/pre-push`; if staged `.go` files changed, `make lint` runs on push.
- `make lint` always formats first via `go fmt ./...`, so expect formatting changes when verifying.
- CI uses Go `1.21.x` in GitHub Actions, while `go.mod` currently declares `go 1.26.2`; trust the executable workflow when checking what CI will run.
