package agentserver

import (
	"database/sql"
	"errors"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type Project struct {
	ID          string            `json:"id"`
	Name        string            `json:"name"`
	Description string            `json:"description,omitempty"`
	RootPath    string            `json:"rootPath,omitempty"`
	Labels      map[string]string `json:"labels,omitempty"`
	CreatedAt   time.Time         `json:"createdAt"`
	UpdatedAt   time.Time         `json:"updatedAt"`
}

type projectRequest struct {
	Name        string            `json:"name" binding:"required"`
	Description string            `json:"description"`
	RootPath    string            `json:"rootPath"`
	Labels      map[string]string `json:"labels"`
}

type ProjectStore struct {
	db *DB
}

func NewProjectStore(db *DB) *ProjectStore {
	return &ProjectStore{db: db}
}

func (s *ProjectStore) RegisterRoutes(r gin.IRouter) {
	g := r.Group("/api/v1/projects")
	g.GET("", s.list)
	g.POST("", s.create)
	g.GET("/:projectId", s.get)
	g.PUT("/:projectId", s.update)
	g.DELETE("/:projectId", s.delete)
}

func (s *ProjectStore) list(c *gin.Context) {
	items, err := s.db.ListProjects()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 500, "message": err.Error()})
		return
	}
	if items == nil {
		items = []*Project{}
	}
	c.JSON(http.StatusOK, gin.H{"items": items, "total": len(items)})
}

func (s *ProjectStore) create(c *gin.Context) {
	var req projectRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "message": err.Error()})
		return
	}
	now := time.Now()
	p := &Project{
		ID:          uuid.NewString(),
		Name:        req.Name,
		Description: req.Description,
		RootPath:    req.RootPath,
		Labels:      req.Labels,
		CreatedAt:   now,
		UpdatedAt:   now,
	}
	if err := s.db.InsertProject(p); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 500, "message": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, p)
}

func (s *ProjectStore) get(c *gin.Context) {
	id := c.Param("projectId")
	p, err := s.db.GetProject(id)
	if errors.Is(err, sql.ErrNoRows) {
		c.JSON(http.StatusNotFound, gin.H{"code": 404, "message": "project not found"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 500, "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, p)
}

func bindJSON(c *gin.Context, dst any) bool {
	if err := c.ShouldBindJSON(dst); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "message": err.Error()})
		return false
	}
	return true
}

func respondLookupError(c *gin.Context, err error, notFoundMessage string) bool {
	if errors.Is(err, sql.ErrNoRows) {
		c.JSON(http.StatusNotFound, gin.H{"code": 404, "message": notFoundMessage})
		return true
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 500, "message": err.Error()})
		return true
	}
	return false
}

func (s *ProjectStore) update(c *gin.Context) {
	id := c.Param("projectId")
	var req projectRequest
	if !bindJSON(c, &req) {
		return
	}
	p, err := s.db.GetProject(id)
	if respondLookupError(c, err, "project not found") {
		return
	}
	p.Name = req.Name
	p.Description = req.Description
	p.RootPath = req.RootPath
	p.Labels = req.Labels
	p.UpdatedAt = time.Now()
	if err := s.db.UpdateProject(p); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 500, "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, p)
}

func (s *ProjectStore) delete(c *gin.Context) {
	id := c.Param("projectId")
	_, err := s.db.GetProject(id)
	if errors.Is(err, sql.ErrNoRows) {
		c.JSON(http.StatusNotFound, gin.H{"code": 404, "message": "project not found"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 500, "message": err.Error()})
		return
	}
	if err := s.db.DeleteProject(id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 500, "message": err.Error()})
		return
	}
	c.Status(http.StatusNoContent)
}
