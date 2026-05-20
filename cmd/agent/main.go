package main

import (
	"embed"
	"flag"
	"io/fs"
	"net/http"
	"os"
	"path/filepath"

	"github.com/gin-gonic/gin"

	"github.com/yylt/agentsandbox/internal/log"
	"github.com/yylt/agentsandbox/pkg/agentserver"
)

//go:embed swagger/*
var swaggerFiles embed.FS

type healthResponse struct {
	Status string `json:"status"`
}

type pingResponse struct {
	Message string `json:"message"`
}

func main() {
	if err := run(); err != nil {
		os.Exit(1)
	}
}

//nolint:funlen
func run() error {
	uiDir := flag.String("ui-dir", "", "path to frontend dist directory (e.g. ./front/dist)")
	dataDir := flag.String("data-dir", "", "data directory for db, temp, downloads, and configs (defaults to cwd/data)")
	workspaceDir := flag.String("workspace-dir", "", "workspace directory for project roots (defaults to cwd/workspace)")
	dbPath := flag.String("db", "", "path to SQLite database file (defaults to data-dir/agent.db)")
	flag.Parse()

	logger := log.New(
		log.WithLevel(os.Getenv("LOG_LEVEL")),
		log.WithSource(),
	)

	cwd, err := os.Getwd()
	if err != nil {
		logger.Error("get working directory", "error", err.Error())
		return err
	}
	paths, err := agentserver.EnsureAppPaths(cwd, *dataDir, *workspaceDir, *dbPath)
	if err != nil {
		logger.Error("prepare app paths", "error", err.Error())
		return err
	}

	db, err := agentserver.NewDB(paths.DBPath)
	if err != nil {
		logger.Error("open database", "error", err.Error())
		return err
	}
	defer db.Close()
	if err := agentserver.SeedBuiltinConfigs(db, paths); err != nil {
		logger.Error("seed builtin configs", "error", err.Error())
		return err
	}

	gin.SetMode(gin.ReleaseMode)
	router := gin.New()
	router.Use(gin.Recovery())

	// ── health ──────────────────────────────────────────────────────────────
	router.GET("/healthz", func(c *gin.Context) {
		c.JSON(http.StatusOK, healthResponse{Status: "ok"})
	})
	router.GET("/readyz", func(c *gin.Context) {
		c.JSON(http.StatusOK, healthResponse{Status: "ready"})
	})
	router.GET("/api/v1/ping", func(c *gin.Context) {
		c.JSON(http.StatusOK, pingResponse{Message: "pong"})
	})

	// ── API handlers ────────────────────────────────────────────────────────
	agentserver.NewProjectStore(db).RegisterRoutes(router)
	agentserver.NewSessionStore(db).RegisterRoutes(router)
	agentserver.NewMessagesHandler(db).RegisterRoutes(router)
	agentserver.NewFilesHandler(paths.WorkspaceDir).RegisterRoutes(router)
	agentserver.NewGitHandler().RegisterRoutes(router)
	agentserver.NewTerminalStore().RegisterRoutes(router)
	agentserver.NewWorkdirHandler(paths.WorkspaceDir).RegisterRoutes(router)
	agentserver.NewCatalogHandler(db, paths).RegisterRoutes(router)

	// ── static: swagger ─────────────────────────────────────────────────────
	swaggerFS, err := fs.Sub(swaggerFiles, "swagger")
	if err != nil {
		logger.Error("load embedded swagger files", "error", err.Error())
		return err
	}
	router.StaticFS("/swagger", http.FS(swaggerFS))

	// ── static: frontend SPA ─────────────────────────────────────────────────
	if *uiDir != "" {
		abs, err := filepath.Abs(*uiDir)
		if err != nil {
			logger.Error("resolve ui-dir", "error", err.Error())
			return err
		}
		if _, err := os.Stat(abs); err != nil {
			logger.Error("ui-dir not found", "path", abs)
			return err
		}
		registerSPADisk(router, abs, logger)
		logger.Info("serving frontend from disk", "dir", abs)
	} else {
		logger.Info("ui-dir not set, frontend not served")
	}

	address := envOrDefault("AGENT_HTTP_ADDR", ":8080")
	logger.Info("starting agent http api", "addr", address)
	if err := router.Run(address); err != nil {
		logger.Error("run agent http api", "error", err.Error())
		return err
	}

	return nil
}

// registerSPADisk serves a Vite-built SPA from a local directory.
// Assets under /assets/ are served directly; everything else falls back to
// index.html so the React router handles client-side navigation.
func registerSPADisk(r *gin.Engine, dir string, _ interface{ Info(string, ...any) }) {
	assetsDir := filepath.Join(dir, "assets")
	if _, err := os.Stat(assetsDir); err == nil {
		r.Static("/assets", assetsDir)
	}

	// Serve any other static files that exist in the dist root (favicon, icons …)
	r.StaticFS("/static", http.Dir(dir))

	indexPath := filepath.Join(dir, "index.html")
	r.NoRoute(func(c *gin.Context) {
		c.File(indexPath)
	})
}

func envOrDefault(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}
