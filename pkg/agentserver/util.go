package agentserver

import (
	"encoding/base64"
	"encoding/json"
	"path/filepath"
	"strings"
)

func encodeB64(data []byte) string {
	return base64.StdEncoding.EncodeToString(data)
}

func decodeB64(s string) ([]byte, error) {
	return base64.StdEncoding.DecodeString(s)
}

func strOrEmpty(s string) string {
	return s
}

func jsonStringMap(m map[string]string) string {
	if m == nil {
		return "{}"
	}
	b, _ := json.Marshal(m)
	return string(b)
}

func parseStringMap(s string) map[string]string {
	if s == "" || s == "{}" {
		return nil
	}
	var m map[string]string
	_ = json.Unmarshal([]byte(s), &m)
	return m
}

func boolToInt(v bool) int {
	if v {
		return 1
	}
	return 0
}

func isWithinRoot(root, target string) bool {
	absRoot, err := filepath.Abs(root)
	if err != nil {
		return false
	}
	absTarget, err := filepath.Abs(target)
	if err != nil {
		return false
	}
	rel, err := filepath.Rel(absRoot, absTarget)
	if err != nil {
		return false
	}
	return rel == "." || (!strings.HasPrefix(rel, "..") && rel != "..")
}
