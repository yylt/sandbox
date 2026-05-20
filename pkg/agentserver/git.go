package agentserver

import (
	"bytes"
	"fmt"
	"net/http"
	"os/exec"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

type gitFileStatus struct {
	Path    string `json:"path"`
	Status  string `json:"status"`
	OldPath string `json:"oldPath,omitempty"`
}

type gitBranch struct {
	Name       string `json:"name"`
	Current    bool   `json:"current"`
	Remote     string `json:"remote,omitempty"`
	LastCommit string `json:"lastCommit,omitempty"`
}

type gitCommitRequest struct {
	RepoPath    string   `json:"repoPath" binding:"required"`
	Message     string   `json:"message" binding:"required"`
	Paths       []string `json:"paths"`
	AuthorName  string   `json:"authorName"`
	AuthorEmail string   `json:"authorEmail"`
}

type gitCheckoutRequest struct {
	RepoPath  string `json:"repoPath" binding:"required"`
	Branch    string `json:"branch" binding:"required"`
	CreateNew bool   `json:"createNew"`
}

type GitHandler struct{}

func NewGitHandler() *GitHandler { return &GitHandler{} }

func (h *GitHandler) RegisterRoutes(r gin.IRouter) {
	g := r.Group("/api/v1/git")
	g.GET("/status", h.status)
	g.GET("/branches", h.branches)
	g.GET("/diff", h.diff)
	g.POST("/commit", h.commit)
	g.POST("/checkout", h.checkout)
	g.POST("/stage", h.stage)
}

func runGit(dir string, args ...string) (string, error) {
	cmd := exec.Command("git", args...)
	cmd.Dir = dir
	var out, errBuf bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &errBuf
	if err := cmd.Run(); err != nil {
		return "", fmt.Errorf("%w: %s", err, errBuf.String())
	}
	return strings.TrimSpace(out.String()), nil
}

//nolint:cyclop
func (h *GitHandler) status(c *gin.Context) {
	repoPath := c.Query("repoPath")
	if repoPath == "" {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "message": "repoPath is required"})
		return
	}

	branch, err := runGit(repoPath, "rev-parse", "--abbrev-ref", "HEAD")
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 500, "message": err.Error()})
		return
	}

	statusOut, err := runGit(repoPath, "status", "--porcelain=v1")
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 500, "message": err.Error()})
		return
	}

	staged := []gitFileStatus{}
	unstaged := []gitFileStatus{}
	untracked := []string{}

	if statusOut != "" {
		for _, line := range strings.Split(statusOut, "\n") {
			if len(line) < 4 {
				continue
			}
			xy := line[:2]
			file := strings.TrimSpace(line[3:])
			x, y := string(xy[0]), string(xy[1])

			if x == "?" && y == "?" {
				untracked = append(untracked, file)
				continue
			}
			if x != " " && x != "?" {
				staged = append(staged, gitFileStatus{
					Path:   file,
					Status: porcelainStatus(x),
				})
			}
			if y != " " && y != "?" {
				unstaged = append(unstaged, gitFileStatus{
					Path:   file,
					Status: porcelainStatus(y),
				})
			}
		}
	}

	// ahead/behind
	ahead, behind := 0, 0
	revList, _ := runGit(repoPath, "rev-list", "--left-right", "--count", "@{u}...HEAD")
	if revList != "" {
		parts := strings.Fields(revList)
		if len(parts) == 2 {
			behind, _ = strconv.Atoi(parts[0])
			ahead, _ = strconv.Atoi(parts[1])
		}
	}

	clean := len(staged) == 0 && len(unstaged) == 0 && len(untracked) == 0
	c.JSON(http.StatusOK, gin.H{
		"repoPath":  repoPath,
		"branch":    branch,
		"clean":     clean,
		"ahead":     ahead,
		"behind":    behind,
		"staged":    staged,
		"unstaged":  unstaged,
		"untracked": untracked,
	})
}

func porcelainStatus(code string) string {
	switch code {
	case "M":
		return "modified"
	case "A":
		return "added"
	case "D":
		return "deleted"
	case "R":
		return "renamed"
	case "C":
		return "added"
	case "U":
		return "conflicted"
	default:
		return "modified"
	}
}

func (h *GitHandler) branches(c *gin.Context) {
	repoPath := c.Query("repoPath")
	if repoPath == "" {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "message": "repoPath is required"})
		return
	}
	out, err := runGit(repoPath, "branch", "-vv")
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 500, "message": err.Error()})
		return
	}
	lines := strings.Split(out, "\n")
	branches := make([]gitBranch, 0, len(lines))
	for _, line := range lines {
		if line == "" {
			continue
		}
		current := strings.HasPrefix(line, "*")
		line = strings.TrimPrefix(line, "* ")
		line = strings.TrimPrefix(line, "  ")
		parts := strings.Fields(line)
		if len(parts) == 0 {
			continue
		}
		b := gitBranch{Name: parts[0], Current: current}
		if len(parts) > 1 {
			b.LastCommit = parts[1]
		}
		branches = append(branches, b)
	}
	c.JSON(http.StatusOK, gin.H{"branches": branches})
}

func (h *GitHandler) diff(c *gin.Context) {
	repoPath := c.Query("repoPath")
	if repoPath == "" {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "message": "repoPath is required"})
		return
	}
	staged := c.Query("staged") == "true"
	filePath := c.Query("filePath")

	args := []string{"diff"}
	if staged {
		args = append(args, "--cached")
	}
	if filePath != "" {
		args = append(args, "--", filePath)
	}
	out, err := runGit(repoPath, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 500, "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"repoPath": repoPath,
		"filePath": filePath,
		"diff":     out,
	})
}

func (h *GitHandler) commit(c *gin.Context) {
	var req gitCommitRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "message": err.Error()})
		return
	}

	// stage files
	if len(req.Paths) > 0 {
		for _, p := range req.Paths {
			if _, err := runGit(req.RepoPath, "add", p); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"code": 500, "message": err.Error()})
				return
			}
		}
	} else {
		if _, err := runGit(req.RepoPath, "add", "-A"); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"code": 500, "message": err.Error()})
			return
		}
	}

	commitArgs := []string{"commit", "-m", req.Message}
	if req.AuthorName != "" && req.AuthorEmail != "" {
		commitArgs = append(commitArgs, "--author", fmt.Sprintf("%s <%s>", req.AuthorName, req.AuthorEmail))
	}
	if _, err := runGit(req.RepoPath, commitArgs...); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 500, "message": err.Error()})
		return
	}

	hash, _ := runGit(req.RepoPath, "rev-parse", "HEAD")
	authorOut, _ := runGit(req.RepoPath, "log", "-1", "--format=%an <%ae>")
	c.JSON(http.StatusOK, gin.H{
		"commitHash":  hash,
		"message":     req.Message,
		"author":      authorOut,
		"committedAt": time.Now(),
	})
}

func (h *GitHandler) checkout(c *gin.Context) {
	var req gitCheckoutRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "message": err.Error()})
		return
	}
	args := []string{"checkout"}
	if req.CreateNew {
		args = append(args, "-b")
	}
	args = append(args, req.Branch)
	if _, err := runGit(req.RepoPath, args...); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 500, "message": err.Error()})
		return
	}

	branch, _ := runGit(req.RepoPath, "rev-parse", "--abbrev-ref", "HEAD")
	c.JSON(http.StatusOK, gin.H{
		"repoPath":  req.RepoPath,
		"branch":    branch,
		"clean":     true,
		"staged":    []gitFileStatus{},
		"unstaged":  []gitFileStatus{},
		"untracked": []string{},
	})
}

type gitStageRequest struct {
	RepoPath string `json:"repoPath" binding:"required"`
	Path     string `json:"path" binding:"required"`
}

func (h *GitHandler) stage(c *gin.Context) {
	var req gitStageRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "message": err.Error()})
		return
	}
	if _, err := runGit(req.RepoPath, "add", req.Path); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 500, "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}
