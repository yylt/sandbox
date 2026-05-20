package agentserver

import (
	"database/sql"
	"errors"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type Session struct {
	ID          string            `json:"id"`
	ProjectID   string            `json:"projectId"`
	Name        string            `json:"name"`
	Description string            `json:"description,omitempty"`
	Status      string            `json:"status"`
	Model       string            `json:"model,omitempty"`
	Metadata    map[string]string `json:"metadata,omitempty"`
	CreatedAt   time.Time         `json:"createdAt"`
	UpdatedAt   time.Time         `json:"updatedAt"`
}

type sessionRequest struct {
	Name        string            `json:"name" binding:"required"`
	Description string            `json:"description"`
	Model       string            `json:"model"`
	Metadata    map[string]string `json:"metadata"`
}

type SessionStore struct {
	db *DB
}

func NewSessionStore(db *DB) *SessionStore {
	return &SessionStore{db: db}
}

func (s *SessionStore) RegisterRoutes(r gin.IRouter) {
	g := r.Group("/api/v1/projects/:projectId/sessions")
	g.GET("", s.list)
	g.POST("", s.create)
	g.DELETE("", s.deleteAll)
	g.GET("/:sessionId", s.get)
	g.PUT("/:sessionId", s.update)
	g.DELETE("/:sessionId", s.delete)
}

func (s *SessionStore) list(c *gin.Context) {
	pid := c.Param("projectId")
	items, err := s.db.ListSessions(pid)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 500, "message": err.Error()})
		return
	}
	if items == nil {
		items = []*Session{}
	}
	c.JSON(http.StatusOK, gin.H{"items": items, "total": len(items)})
}

func (s *SessionStore) create(c *gin.Context) {
	pid := c.Param("projectId")
	var req sessionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "message": err.Error()})
		return
	}
	now := time.Now()
	sess := &Session{
		ID:          uuid.NewString(),
		ProjectID:   pid,
		Name:        req.Name,
		Description: req.Description,
		Status:      "active",
		Model:       req.Model,
		Metadata:    req.Metadata,
		CreatedAt:   now,
		UpdatedAt:   now,
	}
	if err := s.db.InsertSession(sess); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 500, "message": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, sess)
}

func (s *SessionStore) deleteAll(c *gin.Context) {
	pid := c.Param("projectId")
	if err := s.db.DeleteSessionsByProject(pid); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 500, "message": err.Error()})
		return
	}
	c.Status(http.StatusNoContent)
}

func (s *SessionStore) get(c *gin.Context) {
	sid := c.Param("sessionId")
	sess, err := s.db.GetSession(sid)
	if errors.Is(err, sql.ErrNoRows) {
		c.JSON(http.StatusNotFound, gin.H{"code": 404, "message": "session not found"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 500, "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, sess)
}

func (s *SessionStore) update(c *gin.Context) {
	sid := c.Param("sessionId")
	var req sessionRequest
	if !bindJSON(c, &req) {
		return
	}
	sess, err := s.db.GetSession(sid)
	if respondLookupError(c, err, "session not found") {
		return
	}
	sess.Name = req.Name
	sess.Description = req.Description
	sess.Model = req.Model
	sess.Metadata = req.Metadata
	sess.UpdatedAt = time.Now()
	if err := s.db.UpdateSession(sess); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 500, "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, sess)
}

func (s *SessionStore) delete(c *gin.Context) {
	sid := c.Param("sessionId")
	_, err := s.db.GetSession(sid)
	if errors.Is(err, sql.ErrNoRows) {
		c.JSON(http.StatusNotFound, gin.H{"code": 404, "message": "session not found"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 500, "message": err.Error()})
		return
	}
	if err := s.db.DeleteSession(sid); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 500, "message": err.Error()})
		return
	}
	c.Status(http.StatusNoContent)
}
