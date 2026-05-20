package agentserver

import (
	"net/http"
	"os"
	"os/exec"
	"sync"
	"time"

	"github.com/creack/pty"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

type terminalInfo struct {
	ID        string    `json:"id"`
	Shell     string    `json:"shell"`
	Cwd       string    `json:"cwd"`
	Status    string    `json:"status"`
	Cols      int       `json:"cols"`
	Rows      int       `json:"rows"`
	Pid       int       `json:"pid"`
	CreatedAt time.Time `json:"createdAt"`
}

type terminalCreateRequest struct {
	Shell string            `json:"shell"`
	Cwd   string            `json:"cwd"`
	Env   map[string]string `json:"env"`
	Cols  int               `json:"cols"`
	Rows  int               `json:"rows"`
}

type terminalResizeRequest struct {
	Cols int `json:"cols" binding:"required"`
	Rows int `json:"rows" binding:"required"`
}

type termSession struct {
	info terminalInfo
	cmd  *exec.Cmd
	ptmx *os.File
}

type TerminalStore struct {
	mu       sync.RWMutex
	terms    map[string]*termSession
	upgrader websocket.Upgrader
}

func NewTerminalStore() *TerminalStore {
	return &TerminalStore{
		terms: make(map[string]*termSession),
		upgrader: websocket.Upgrader{
			CheckOrigin: func(_ *http.Request) bool { return true },
		},
	}
}

func (s *TerminalStore) RegisterRoutes(r gin.IRouter) {
	g := r.Group("/api/v1/terminals")
	g.GET("", s.list)
	g.POST("", s.create)
	g.GET("/:terminalId", s.get)
	g.DELETE("/:terminalId", s.delete)
	g.POST("/:terminalId/resize", s.resize)
	g.GET("/:terminalId/ws", s.ws)
}

func (s *TerminalStore) list(c *gin.Context) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	items := make([]terminalInfo, 0, len(s.terms))
	for _, t := range s.terms {
		items = append(items, t.info)
	}
	c.JSON(http.StatusOK, gin.H{"items": items})
}

func (s *TerminalStore) create(c *gin.Context) {
	var req terminalCreateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "message": err.Error()})
		return
	}
	shell := req.Shell
	if shell == "" {
		shell = os.Getenv("SHELL")
		if shell == "" {
			shell = "/bin/sh"
		}
	}
	cwd := req.Cwd
	if cwd == "" {
		cwd, _ = os.Getwd()
	}
	cols := req.Cols
	if cols <= 0 {
		cols = 80
	}
	rows := req.Rows
	if rows <= 0 {
		rows = 24
	}

	id := uuid.NewString()
	info := terminalInfo{
		ID:        id,
		Shell:     shell,
		Cwd:       cwd,
		Status:    "running",
		Cols:      cols,
		Rows:      rows,
		CreatedAt: time.Now(),
	}
	s.mu.Lock()
	s.terms[id] = &termSession{info: info}
	s.mu.Unlock()
	c.JSON(http.StatusCreated, info)
}

func (s *TerminalStore) get(c *gin.Context) {
	id := c.Param("terminalId")
	s.mu.RLock()
	t, ok := s.terms[id]
	s.mu.RUnlock()
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"code": 404, "message": "terminal not found"})
		return
	}
	c.JSON(http.StatusOK, t.info)
}

func (s *TerminalStore) delete(c *gin.Context) {
	id := c.Param("terminalId")
	s.mu.Lock()
	t, ok := s.terms[id]
	if ok {
		if t.ptmx != nil {
			_ = t.ptmx.Close()
		}
		if t.cmd != nil && t.cmd.Process != nil {
			_ = t.cmd.Process.Kill()
		}
		delete(s.terms, id)
	}
	s.mu.Unlock()
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"code": 404, "message": "terminal not found"})
		return
	}
	c.Status(http.StatusNoContent)
}

func (s *TerminalStore) resize(c *gin.Context) {
	id := c.Param("terminalId")
	var req terminalResizeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "message": err.Error()})
		return
	}
	s.mu.Lock()
	t, ok := s.terms[id]
	if ok {
		t.info.Cols = req.Cols
		t.info.Rows = req.Rows
		if t.ptmx != nil {
			_ = pty.Setsize(t.ptmx, &pty.Winsize{
				Cols: uint16(req.Cols),
				Rows: uint16(req.Rows),
			})
		}
	}
	s.mu.Unlock()
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"code": 404, "message": "terminal not found"})
		return
	}
	c.Status(http.StatusNoContent)
}

// wsFrame is the JSON frame exchanged over WebSocket.
type wsFrame struct {
	Type string `json:"type"`
	Data string `json:"data"`
}

//nolint:cyclop,funlen
func (s *TerminalStore) ws(c *gin.Context) {
	id := c.Param("terminalId")
	s.mu.RLock()
	t, ok := s.terms[id]
	s.mu.RUnlock()
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"code": 404, "message": "terminal not found"})
		return
	}

	conn, err := s.upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		return
	}
	defer conn.Close()

	cmd := exec.Command(t.info.Shell)
	cmd.Dir = t.info.Cwd
	cmd.Env = append(os.Environ(),
		"TERM=xterm-256color",
		"COLORTERM=truecolor",
	)

	ptmx, err := pty.StartWithSize(cmd, &pty.Winsize{
		Cols: uint16(t.info.Cols),
		Rows: uint16(t.info.Rows),
	})
	if err != nil {
		_ = conn.WriteJSON(wsFrame{Type: "output", Data: encodeB64([]byte("failed to start pty: " + err.Error()))})
		return
	}

	s.mu.Lock()
	t.cmd = cmd
	t.ptmx = ptmx
	t.info.Pid = cmd.Process.Pid
	s.mu.Unlock()

	// pty → WebSocket
	go func() {
		buf := make([]byte, 4096)
		for {
			n, err := ptmx.Read(buf)
			if n > 0 {
				_ = conn.WriteJSON(wsFrame{Type: "output", Data: encodeB64(buf[:n])})
			}
			if err != nil {
				break
			}
		}
		conn.Close()
	}()

	// WebSocket → pty
	for {
		var frame wsFrame
		if err := conn.ReadJSON(&frame); err != nil {
			break
		}
		if frame.Type == "input" {
			data, err := decodeB64(frame.Data)
			if err != nil {
				continue
			}
			if _, err := ptmx.Write(data); err != nil {
				break
			}
		}
	}

	_ = ptmx.Close()
	_ = cmd.Process.Kill()
	_ = cmd.Wait()

	s.mu.Lock()
	if t2, ok2 := s.terms[id]; ok2 {
		t2.info.Status = "exited"
		t2.cmd = nil
		t2.ptmx = nil
	}
	s.mu.Unlock()
}
