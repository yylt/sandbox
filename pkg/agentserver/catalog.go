package agentserver

import (
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type CatalogHandler struct {
	db    *DB
	paths *AppPaths
}

type configListResponse struct {
	Items []ConfigItem `json:"items"`
	Total int          `json:"total"`
}

var errCandidateNotFound = errors.New("candidate not found")

type configUpsertRequest struct {
	Name      string `json:"name" binding:"required"`
	Desc      string `json:"desc"`
	Prompt    string `json:"prompt"`
	URL       string `json:"url"`
	Enabled   *bool  `json:"enabled"`
	Candidate string `json:"candidate"`
}

type configScanRequest struct {
	URL string `json:"url" binding:"required"`
}

type scanItem struct {
	Name      string `json:"name"`
	Desc      string `json:"desc,omitempty"`
	Prompt    string `json:"prompt,omitempty"`
	Selected  bool   `json:"selected"`
	SourceURL string `json:"sourceUrl,omitempty"`
}

func NewCatalogHandler(db *DB, paths *AppPaths) *CatalogHandler {
	return &CatalogHandler{db: db, paths: paths}
}

func (h *CatalogHandler) RegisterRoutes(r gin.IRouter) {
	g := r.Group("/api/v1/config")
	g.GET("/:kind", h.list)
	g.POST("/:kind", h.create)
	g.DELETE("/:kind/:id", h.delete)
	g.POST("/:kind/scan", h.scan)
}

func (h *CatalogHandler) list(c *gin.Context) {
	kind, ok := normalizeKind(c.Param("kind"))
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "message": "invalid config kind"})
		return
	}
	items, err := h.db.ListConfigs(kind)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 500, "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, configListResponse{Items: items, Total: len(items)})
}

//nolint:cyclop
func (h *CatalogHandler) create(c *gin.Context) {
	kind, ok := normalizeKind(c.Param("kind"))
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "message": "invalid config kind"})
		return
	}
	var req configUpsertRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "message": err.Error()})
		return
	}
	name := strings.TrimSpace(req.Name)
	if name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "message": "name is required"})
		return
	}
	if strings.TrimSpace(req.URL) != "" && strings.TrimSpace(req.Candidate) != "" {
		if err := h.installScannedItem(kind, req.URL, req.Candidate, name); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"code": 400, "message": err.Error()})
			return
		}
	}
	item := ConfigItem{
		ID:        fmt.Sprintf("%s-%s", kind, uuid.NewString()),
		Kind:      kind,
		Name:      name,
		Desc:      req.Desc,
		Prompt:    req.Prompt,
		URL:       req.URL,
		Enabled:   req.Enabled != nil && *req.Enabled,
		Builtin:   false,
		Source:    sourceForKind(kind, req.URL),
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}
	if req.Prompt == "" && strings.TrimSpace(req.URL) != "" && strings.TrimSpace(req.Candidate) != "" {
		promptPath := filepath.Join(targetDirForKind(h.paths, kind), name, scanPromptFile(kind))
		if data, err := os.ReadFile(promptPath); err == nil {
			item.Prompt = string(data)
		}
	}
	if err := h.db.UpsertConfig(item); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 500, "message": err.Error()})
		return
	}
	items, err := h.db.ListConfigs(kind)
	if err != nil {
		c.JSON(http.StatusCreated, item)
		return
	}
	for _, candidate := range items {
		if candidate.Name == item.Name {
			c.JSON(http.StatusCreated, candidate)
			return
		}
	}
	c.JSON(http.StatusCreated, item)
}

func (h *CatalogHandler) delete(c *gin.Context) {
	kind, ok := normalizeKind(c.Param("kind"))
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "message": "invalid config kind"})
		return
	}
	if err := h.db.DeleteConfig(kind, c.Param("id")); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 500, "message": err.Error()})
		return
	}
	c.Status(http.StatusNoContent)
}

func (h *CatalogHandler) scan(c *gin.Context) {
	kind, ok := normalizeKind(c.Param("kind"))
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "message": "invalid config kind"})
		return
	}
	var req configScanRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "message": err.Error()})
		return
	}
	root, err := h.cloneRepo(req.URL)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "message": err.Error()})
		return
	}
	targetDir := filepath.Join(root, scanSubdir(kind))
	entries, err := os.ReadDir(targetDir)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "message": fmt.Sprintf("repo missing %s directory", scanSubdir(kind))})
		return
	}
	items := make([]scanItem, 0)
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		item := scanItem{Name: entry.Name(), Selected: true, SourceURL: req.URL}
		promptPath := filepath.Join(targetDir, entry.Name(), scanPromptFile(kind))
		if data, err := os.ReadFile(promptPath); err == nil {
			item.Prompt = string(data)
		}
		items = append(items, item)
	}
	c.JSON(http.StatusOK, gin.H{"items": items, "total": len(items)})
}

func (h *CatalogHandler) cloneRepo(url string) (string, error) {
	repoName := strings.TrimSuffix(filepath.Base(strings.TrimSpace(url)), ".git")
	if repoName == "." || repoName == "" || repoName == string(filepath.Separator) {
		repoName = fmt.Sprintf("repo-%d", time.Now().UnixNano())
	}
	root := filepath.Join(h.paths.DownloadsDir, fmt.Sprintf("%s-%d", repoName, time.Now().UnixNano()))
	cmd := exec.Command("git", "clone", "--depth=1", url, root)
	if output, err := cmd.CombinedOutput(); err != nil {
		return "", fmt.Errorf("git clone failed: %w: %s", err, strings.TrimSpace(string(output)))
	}
	return root, nil
}

func (h *CatalogHandler) installScannedItem(kind, url, candidate, name string) error {
	root, err := h.cloneRepo(url)
	if err != nil {
		return err
	}
	sourceDir := filepath.Join(root, scanSubdir(kind), candidate)
	info, err := os.Stat(sourceDir)
	if err != nil || !info.IsDir() {
		return fmt.Errorf("%w: %s", errCandidateNotFound, candidate)
	}
	targetDir := filepath.Join(targetDirForKind(h.paths, kind), name)
	_ = os.RemoveAll(targetDir)
	return copyDir(sourceDir, targetDir)
}

func normalizeKind(kind string) (string, bool) {
	switch kind {
	case "agents":
		return configKindAgent, true
	case "commands":
		return configKindCommand, true
	case "skills":
		return configKindSkill, true
	case "mcp":
		return configKindMCP, true
	default:
		return "", false
	}
}

func sourceForKind(kind, url string) string {
	if strings.TrimSpace(url) != "" {
		return url
	}
	switch kind {
	case configKindAgent:
		return "data/agents"
	case configKindCommand:
		return "data/commands"
	case configKindSkill:
		return "data/skills"
	case configKindMCP:
		return "data/mcp"
	default:
		return ""
	}
}

func scanSubdir(kind string) string {
	switch kind {
	case configKindAgent:
		return "agents"
	case configKindCommand:
		return "commands"
	case configKindSkill:
		return "skills"
	case configKindMCP:
		return "mcp"
	default:
		return ""
	}
}

func scanPromptFile(kind string) string {
	switch kind {
	case configKindSkill:
		return "SKILL.md"
	default:
		return "prompt.txt"
	}
}

func targetDirForKind(paths *AppPaths, kind string) string {
	switch kind {
	case configKindAgent:
		return paths.AgentsDir
	case configKindCommand:
		return paths.CommandsDir
	case configKindSkill:
		return paths.SkillsDir
	case configKindMCP:
		return paths.MCPDir
	default:
		return paths.DataDir
	}
}

func copyDir(src, dst string) error {
	if err := os.MkdirAll(dst, 0o755); err != nil {
		return err
	}
	entries, err := os.ReadDir(src)
	if err != nil {
		return err
	}
	for _, entry := range entries {
		srcPath := filepath.Join(src, entry.Name())
		dstPath := filepath.Join(dst, entry.Name())
		if entry.IsDir() {
			if err := copyDir(srcPath, dstPath); err != nil {
				return err
			}
			continue
		}
		if err := copyFile(srcPath, dstPath); err != nil {
			return err
		}
	}
	return nil
}

func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	if err := os.MkdirAll(filepath.Dir(dst), 0o755); err != nil {
		return err
	}
	out, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer out.Close()
	if _, err := io.Copy(out, in); err != nil {
		return err
	}
	return out.Close()
}
