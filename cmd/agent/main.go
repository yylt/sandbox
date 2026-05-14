package main

import (
	"embed"
	"io/fs"
	"net/http"
	"os"

	"github.com/gin-gonic/gin"

	"github.com/yylt/agentsandbox/internal/log"
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
	logger := log.New(
		log.WithLevel(os.Getenv("LOG_LEVEL")),
		log.WithSource(),
	)

	gin.SetMode(gin.ReleaseMode)
	router := gin.New()
	router.Use(gin.Recovery())

	router.GET("/healthz", func(c *gin.Context) {
		c.JSON(http.StatusOK, healthResponse{Status: "ok"})
	})
	router.GET("/readyz", func(c *gin.Context) {
		c.JSON(http.StatusOK, healthResponse{Status: "ready"})
	})
	router.GET("/api/v1/ping", func(c *gin.Context) {
		c.JSON(http.StatusOK, pingResponse{Message: "pong"})
	})

	swaggerFS, err := fs.Sub(swaggerFiles, "swagger")
	if err != nil {
		logger.Error("load embedded swagger files", "error", err.Error())
		os.Exit(1)
	}
	router.StaticFS("/swagger", http.FS(swaggerFS))

	address := envOrDefault("AGENT_HTTP_ADDR", ":8080")
	logger.Info("starting agent http api", "addr", address)
	if err := router.Run(address); err != nil {
		logger.Error("run agent http api", "error", err.Error())
		os.Exit(1)
	}
}

func envOrDefault(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}
