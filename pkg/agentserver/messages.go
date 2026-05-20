package agentserver

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type Message struct {
	ID        string    `json:"id"`
	SessionID string    `json:"sessionId"`
	Role      string    `json:"role"`
	Content   string    `json:"content"`
	Model     string    `json:"model,omitempty"`
	CreatedAt time.Time `json:"createdAt"`
}

type messageRequest struct {
	Role    string `json:"role" binding:"required"`
	Content string `json:"content" binding:"required"`
	Model   string `json:"model"`
}

type MessagesHandler struct {
	db *DB
}

func NewMessagesHandler(db *DB) *MessagesHandler {
	return &MessagesHandler{db: db}
}

func (h *MessagesHandler) RegisterRoutes(r gin.IRouter) {
	g := r.Group("/api/v1/sessions/:sessionId/messages")
	g.GET("", h.list)
	g.POST("", h.create)
	g.DELETE("", h.deleteAll)
}

func (h *MessagesHandler) list(c *gin.Context) {
	sid := c.Param("sessionId")
	items, err := h.db.ListMessages(sid)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 500, "message": err.Error()})
		return
	}
	if items == nil {
		items = []*Message{}
	}
	c.JSON(http.StatusOK, gin.H{"items": items, "total": len(items)})
}

func (h *MessagesHandler) create(c *gin.Context) {
	sid := c.Param("sessionId")
	var req messageRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "message": err.Error()})
		return
	}
	m := &Message{
		ID:        uuid.NewString(),
		SessionID: sid,
		Role:      req.Role,
		Content:   req.Content,
		Model:     req.Model,
		CreatedAt: time.Now(),
	}
	if err := h.db.InsertMessage(m); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 500, "message": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, m)
}

func (h *MessagesHandler) deleteAll(c *gin.Context) {
	sid := c.Param("sessionId")
	if err := h.db.DeleteMessagesBySession(sid); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 500, "message": err.Error()})
		return
	}
	c.Status(http.StatusNoContent)
}
