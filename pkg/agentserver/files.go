package agentserver

import (
	"encoding/base64"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"github.com/gin-gonic/gin"
)

const queryTrue = "true"

type fileEntry struct {
	Name        string    `json:"name"`
	Path        string    `json:"path"`
	Type        string    `json:"type"`
	Size        int64     `json:"size,omitempty"`
	ModifiedAt  time.Time `json:"modifiedAt,omitempty"`
	Permissions string    `json:"permissions,omitempty"`
}

type fileCreateRequest struct {
	Path        string `json:"path" binding:"required"`
	Type        string `json:"type" binding:"required"`
	Content     string `json:"content"`
	Permissions string `json:"permissions"`
	Confirm     bool   `json:"confirm"`
}

type fileContentRequest struct {
	Path     string `json:"path" binding:"required"`
	Content  string `json:"content" binding:"required"`
	Encoding string `json:"encoding"`
	Confirm  bool   `json:"confirm"`
}

type FilesHandler struct {
	workspaceRoot string
}

func NewFilesHandler(workspaceRoot string) *FilesHandler {
	return &FilesHandler{workspaceRoot: workspaceRoot}
}

func (h *FilesHandler) RegisterRoutes(r gin.IRouter) {
	g := r.Group("/api/v1/files")
	g.GET("", h.list)
	g.POST("", h.create)
	g.DELETE("", h.deleteFile)
	g.GET("/content", h.readContent)
	g.PUT("/content", h.writeContent)
}

func (h *FilesHandler) list(c *gin.Context) {
	path := c.Query("path")
	if path == "" {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "message": "path is required"})
		return
	}
	if !h.ensurePathAllowed(c, path, c.Query("confirm") == queryTrue) {
		return
	}
	entries, err := os.ReadDir(path)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 500, "message": err.Error()})
		return
	}
	items := make([]fileEntry, 0, len(entries))
	for _, e := range entries {
		info, err := e.Info()
		if err != nil {
			continue
		}
		t := "file"
		if e.IsDir() {
			t = "directory"
		} else if e.Type()&os.ModeSymlink != 0 {
			t = "symlink"
		}
		items = append(items, fileEntry{
			Name:        e.Name(),
			Path:        filepath.Join(path, e.Name()),
			Type:        t,
			Size:        info.Size(),
			ModifiedAt:  info.ModTime(),
			Permissions: info.Mode().String(),
		})
	}
	c.JSON(http.StatusOK, gin.H{"path": path, "entries": items})
}

//nolint:cyclop
func (h *FilesHandler) create(c *gin.Context) {
	var req fileCreateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "message": err.Error()})
		return
	}
	if !h.ensurePathAllowed(c, req.Path, req.Confirm) {
		return
	}
	switch req.Type {
	case "directory":
		if err := os.MkdirAll(req.Path, 0o755); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"code": 500, "message": err.Error()})
			return
		}
	case "file":
		var content []byte
		if req.Content != "" {
			var err error
			content, err = base64.StdEncoding.DecodeString(req.Content)
			if err != nil {
				content = []byte(req.Content)
			}
		}
		if err := os.MkdirAll(filepath.Dir(req.Path), 0o755); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"code": 500, "message": err.Error()})
			return
		}
		if err := os.WriteFile(req.Path, content, 0o644); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"code": 500, "message": err.Error()})
			return
		}
	default:
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "message": "type must be file or directory"})
		return
	}
	info, _ := os.Stat(req.Path)
	entry := fileEntry{
		Name: filepath.Base(req.Path),
		Path: req.Path,
		Type: req.Type,
	}
	if info != nil {
		entry.Size = info.Size()
		entry.ModifiedAt = info.ModTime()
		entry.Permissions = info.Mode().String()
	}
	c.JSON(http.StatusCreated, entry)
}

func (h *FilesHandler) deleteFile(c *gin.Context) {
	path := c.Query("path")
	if path == "" {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "message": "path is required"})
		return
	}
	confirm := c.Query("confirm") == queryTrue
	if !h.ensurePathAllowed(c, path, confirm) {
		return
	}
	recursive := c.Query("recursive") == queryTrue
	var err error
	if recursive {
		err = os.RemoveAll(path)
	} else {
		err = os.Remove(path)
	}
	if err != nil {
		if os.IsNotExist(err) {
			c.JSON(http.StatusNotFound, gin.H{"code": 404, "message": "path not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"code": 500, "message": err.Error()})
		return
	}
	c.Status(http.StatusNoContent)
}

func (h *FilesHandler) readContent(c *gin.Context) {
	path := c.Query("path")
	if path == "" {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "message": "path is required"})
		return
	}
	if !h.ensurePathAllowed(c, path, c.Query("confirm") == queryTrue) {
		return
	}
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			c.JSON(http.StatusNotFound, gin.H{"code": 404, "message": "file not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"code": 500, "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"path":     path,
		"content":  string(data),
		"encoding": "utf8",
		"size":     len(data),
	})
}

func (h *FilesHandler) writeContent(c *gin.Context) {
	var req fileContentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "message": err.Error()})
		return
	}
	if !h.ensurePathAllowed(c, req.Path, req.Confirm) {
		return
	}
	var data []byte
	if req.Encoding == "base64" {
		var err error
		data, err = base64.StdEncoding.DecodeString(req.Content)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"code": 400, "message": "invalid base64 content"})
			return
		}
	} else {
		data = []byte(req.Content)
	}
	if err := os.MkdirAll(filepath.Dir(req.Path), 0o755); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 500, "message": err.Error()})
		return
	}
	if err := os.WriteFile(req.Path, data, 0o644); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 500, "message": err.Error()})
		return
	}
	info, _ := os.Stat(req.Path)
	entry := fileEntry{
		Name: filepath.Base(req.Path),
		Path: req.Path,
		Type: "file",
	}
	if info != nil {
		entry.Size = info.Size()
		entry.ModifiedAt = info.ModTime()
		entry.Permissions = info.Mode().String()
	}
	c.JSON(http.StatusOK, entry)
}

func (h *FilesHandler) ensurePathAllowed(c *gin.Context, path string, confirm bool) bool {
	if h.workspaceRoot == "" || isWithinRoot(h.workspaceRoot, path) || confirm {
		return true
	}
	c.JSON(http.StatusConflict, gin.H{
		"code":            409,
		"message":         "path is outside workspace, confirmation required",
		"requiresConfirm": true,
		"path":            path,
		"workspaceRoot":   h.workspaceRoot,
	})
	return false
}
