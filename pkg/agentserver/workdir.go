package agentserver

import (
	"net/http"
	"os"
	"path/filepath"

	"github.com/gin-gonic/gin"
)

type WorkdirHandler struct {
	root string
}

func NewWorkdirHandler(root string) *WorkdirHandler {
	return &WorkdirHandler{root: root}
}

func (h *WorkdirHandler) RegisterRoutes(r gin.IRouter) {
	r.GET("/api/v1/workdir/list", h.list)
}

type workdirEntry struct {
	Name string `json:"name"`
	Path string `json:"path"`
}

func (h *WorkdirHandler) list(c *gin.Context) {
	root := h.root
	if root == "" {
		var err error
		root, err = os.Getwd()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"code": 500, "message": err.Error()})
			return
		}
	}

	absRoot, err := filepath.Abs(root)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 500, "message": err.Error()})
		return
	}

	entries, err := os.ReadDir(absRoot)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 500, "message": err.Error()})
		return
	}

	dirs := make([]workdirEntry, 0)
	for _, e := range entries {
		if e.IsDir() {
			dirs = append(dirs, workdirEntry{
				Name: e.Name(),
				Path: filepath.Join(absRoot, e.Name()),
			})
		}
	}
	c.JSON(http.StatusOK, gin.H{"root": absRoot, "items": dirs})
}
