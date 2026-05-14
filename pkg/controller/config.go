package controller

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"strings"
	"sync"

	corev1 "k8s.io/api/core/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/types"
	ctrl "sigs.k8s.io/controller-runtime"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/controller"
	"sigs.k8s.io/yaml"
)

const configFileKey = "config.yaml"
const serviceAccountNamespacePath = "/var/run/secrets/kubernetes.io/serviceaccount/namespace"

var (
	ErrConfigMapRequired      = errors.New("configmap is required")
	ErrConfigFileMissing      = errors.New("configmap missing config.yaml")
	ErrRuntimeNamespaceEmpty  = errors.New("runtime namespace is empty")
	ErrMetricsRestartRequired = errors.New("metrics address changes require process restart to take effect")
)

type RuntimeConfig struct {
	MetricsAddr            string `yaml:"metrics-addr"`
	DefaultSandboxTemplate string `yaml:"default-sandbox-template"`
	DefaultSandboxWarmPool string `yaml:"default-sandbox-warmpool"`
	ManagedLabelKey        string `yaml:"managed-label-key"`
	ManagedLabelValue      string `yaml:"managed-label-value"`
}

func DefaultRuntimeConfig() RuntimeConfig {
	return RuntimeConfig{
		MetricsAddr:            "",
		DefaultSandboxTemplate: "default",
		DefaultSandboxWarmPool: "",
		ManagedLabelKey:        "sandbox.io/managed",
		ManagedLabelValue:      "sandboxs",
	}
}

type ConfigStore struct {
	mu     sync.RWMutex
	config RuntimeConfig
	key    types.NamespacedName
	logger *slog.Logger
}

func NewConfigStore(key types.NamespacedName, logger *slog.Logger) *ConfigStore {
	return &ConfigStore{key: key, logger: logger, config: DefaultRuntimeConfig()}
}

func (s *ConfigStore) Get() RuntimeConfig {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.config
}

func (s *ConfigStore) Set(cfg RuntimeConfig) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.config = cfg
	if s.logger != nil {
		s.logger.Info("runtime config reloaded",
			slog.String("configmap", s.key.String()),
			slog.String("metrics_addr", cfg.MetricsAddr),
			slog.String("default_sandbox_template", cfg.DefaultSandboxTemplate),
			slog.String("default_sandbox_warmpool", cfg.DefaultSandboxWarmPool),
			slog.String("managed_label_key", cfg.ManagedLabelKey),
			slog.String("managed_label_value", cfg.ManagedLabelValue),
		)
	}
	if s.logger != nil && cfg.MetricsAddr != "" {
		s.logger.Info(ErrMetricsRestartRequired.Error(), slog.String("metrics_addr", cfg.MetricsAddr))
	}
}

func LoadRuntimeConfig(ctx context.Context, kubeClient client.Client, key types.NamespacedName) (RuntimeConfig, error) {
	configMap := &corev1.ConfigMap{}
	if err := kubeClient.Get(ctx, key, configMap); err != nil {
		return RuntimeConfig{}, fmt.Errorf("get configmap %s: %w", key.String(), err)
	}
	return ParseRuntimeConfig(configMap)
}

func ParseRuntimeConfig(configMap *corev1.ConfigMap) (RuntimeConfig, error) {
	if configMap == nil {
		return RuntimeConfig{}, ErrConfigMapRequired
	}
	rawConfig, ok := configMap.Data[configFileKey]
	if !ok {
		return RuntimeConfig{}, fmt.Errorf("%w: %s/%s", ErrConfigFileMissing, configMap.Namespace, configMap.Name)
	}

	config := DefaultRuntimeConfig()
	if rawConfig == "" {
		return config, nil
	}
	if err := yaml.Unmarshal([]byte(rawConfig), &config); err != nil {
		return RuntimeConfig{}, fmt.Errorf("parse %s: %w", configFileKey, err)
	}
	if config.DefaultSandboxTemplate == "" {
		config.DefaultSandboxTemplate = DefaultRuntimeConfig().DefaultSandboxTemplate
	}
	if config.ManagedLabelKey == "" {
		config.ManagedLabelKey = DefaultRuntimeConfig().ManagedLabelKey
	}
	if config.ManagedLabelValue == "" {
		config.ManagedLabelValue = DefaultRuntimeConfig().ManagedLabelValue
	}
	return config, nil
}

type ConfigMapReconciler struct {
	client.Client
	Key   types.NamespacedName
	Store *ConfigStore
}

func (r *ConfigMapReconciler) Reconcile(ctx context.Context, req ctrl.Request) (ctrl.Result, error) {
	if req.NamespacedName != r.Key {
		return ctrl.Result{}, nil
	}

	configMap := &corev1.ConfigMap{}
	if err := r.Get(ctx, req.NamespacedName, configMap); err != nil {
		if apierrors.IsNotFound(err) {
			return ctrl.Result{}, nil
		}
		return ctrl.Result{}, err
	}

	config, err := ParseRuntimeConfig(configMap)
	if err != nil {
		return ctrl.Result{}, err
	}
	r.Store.Set(config)
	return ctrl.Result{}, nil
}

func ResolveRuntimeNamespace() (string, error) {
	return readNamespace()
}

func readNamespace() (string, error) {
	if namespace := strings.TrimSpace(os.Getenv("POD_NAMESPACE")); namespace != "" {
		return namespace, nil
	}
	rawNamespace, err := os.ReadFile(serviceAccountNamespacePath)
	if err != nil {
		return "", fmt.Errorf("read runtime namespace: %w", err)
	}
	namespace := strings.TrimSpace(string(rawNamespace))
	if namespace == "" {
		return "", ErrRuntimeNamespaceEmpty
	}
	return namespace, nil
}

func (r *ConfigMapReconciler) SetupControllerWithManager(mgr ctrl.Manager) error {
	return ctrl.NewControllerManagedBy(mgr).
		For(&corev1.ConfigMap{}).
		WithOptions(controller.Options{MaxConcurrentReconciles: 1}).
		Complete(r)
}
