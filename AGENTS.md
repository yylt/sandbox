# AGENTS.md

## Repo Shape
- Go module: `github.com/yylt/agentsandbox`.
- Main binary entrypoint is `cmd/sandbox/main.go`.
- Current handwritten code is concentrated in `internal/log`.
- Protobuf source lives in `api/proto`; generated Go code is written under `internal/pkg/api/pb`, and OpenAPI output goes to `api/openapi`.

## Commands
- Use `make help` to discover repo targets.
- Initial repo setup is `make all`; it sets `core.hooksPath` to `.githooks/`, installs codegen tools into `bin/`, runs protobuf generation, and runs `go mod tidy`.
- Run the app with `make run` or `go run ./cmd/sandbox/main.go`.
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
- If you change anything under `api/proto`, run `make generate`.
- `make generate` depends on Buf and protoc plugins installed into the repo-local `bin/` directory.
- `api/proto/buf.lock` is updated via `make generate` / Buf targets; do not hand-edit it.

## Workflow Gotchas
- The repo uses a custom pre-push hook in `.githooks/pre-push`; if staged `.go` files changed, `make lint` runs on push.
- `make lint` always formats first via `go fmt ./...`, so expect formatting changes when verifying.
- CI uses Go `1.21.x` in GitHub Actions, while `go.mod` currently declares `go 1.26.2`; trust the executable workflow when checking what CI will run.
