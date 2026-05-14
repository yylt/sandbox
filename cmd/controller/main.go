package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"os"

	"github.com/grpc-ecosystem/grpc-gateway/v2/runtime"
	"google.golang.org/grpc"
	"google.golang.org/grpc/reflection"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/client-go/rest"
	// This controls the maxprocs environment variable in container runtimes.
	// see https://martin.baillie.id/wrote/gotchas-in-the-go-network-packages-defaults/#bonus-gomaxprocs-containers-and-the-cfs
	"go.uber.org/automaxprocs/maxprocs"
	ctrl "sigs.k8s.io/controller-runtime"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/client/config"
	"sigs.k8s.io/controller-runtime/pkg/healthz"
	metricsserver "sigs.k8s.io/controller-runtime/pkg/metrics/server"

	"github.com/yylt/agentsandbox/internal/log"
	sandboxpb "github.com/yylt/agentsandbox/internal/pkg/api/pb/sandbox/v1"
	controller "github.com/yylt/agentsandbox/pkg/controller"
)

var ErrConfigMapFlagRequired = errors.New("--configmap is required")

func main() {
	// Logger configuration
	logger := log.New(
		log.WithLevel(os.Getenv("LOG_LEVEL")),
		log.WithSource(),
	)

	if err := run(logger); err != nil {
		logger.ErrorContext(context.Background(), "an error occurred", slog.String("error", err.Error()))
		os.Exit(1)
	}
}

func run(logger *slog.Logger) error {
	ctx := context.Background()
	configMapName := flag.String("configmap", "", "name of the runtime configmap")
	flag.Parse()
	if *configMapName == "" {
		return ErrConfigMapFlagRequired
	}

	_, err := maxprocs.Set(maxprocs.Logger(func(s string, i ...interface{}) {
		logger.DebugContext(ctx, fmt.Sprintf(s, i...))
	}))
	if err != nil {
		return fmt.Errorf("setting max procs: %w", err)
	}

	operatorConfig := controller.DefaultOperatorConfig()
	restConfig, configKey, err := loadRuntimeEnvironment()
	if err != nil {
		return err
	}

	bootstrapManager, err := newBootstrapManager(restConfig)
	if err != nil {
		return fmt.Errorf("create bootstrap manager: %w", err)
	}

	runtimeConfig, err := loadBootstrapRuntimeConfig(ctx, bootstrapManager.GetClient(), configKey)
	if err != nil {
		return fmt.Errorf("load runtime config: %w", err)
	}
	configStore, resourceCache, err := prepareRuntimeState(ctx, logger, bootstrapManager.GetClient(), configKey, runtimeConfig)
	if err != nil {
		return err
	}

	mgr, err := ctrl.NewManager(restConfig, ctrl.Options{
		Scheme:                 controller.NewScheme(),
		Metrics:                metricsserver.Options{BindAddress: runtimeConfig.MetricsAddr},
		HealthProbeBindAddress: ":8081",
		LeaderElection:         true,
		LeaderElectionID:       "a3317529.agent-sandbox.x-k8s.io",
	})
	if err != nil {
		return fmt.Errorf("create operator manager: %w", err)
	}

	if err := setupManager(mgr, operatorConfig, resourceCache, configStore, configKey); err != nil {
		return err
	}

	resourceAPI := controller.NewSandboxAPI(mgr.GetClient(), mgr.GetScheme(), resourceCache, configStore)

	errCh := make(chan error, 2)

	go func() {
		logger.InfoContext(ctx, "starting operator manager")
		errCh <- mgr.Start(ctx)
	}()

	go func() {
		errCh <- serveAPI(ctx, logger, resourceAPI)
	}()

	if err := <-errCh; err != nil {
		return fmt.Errorf("run sandbox services: %w", err)
	}

	return nil
}

func loadRuntimeEnvironment() (*rest.Config, types.NamespacedName, error) {
	restConfig, err := config.GetConfig()
	if err != nil {
		return nil, types.NamespacedName{}, fmt.Errorf("load kube config: %w", err)
	}
	restConfig.Burst = 10
	namespace, err := loadRuntimeNamespace()
	if err != nil {
		return nil, types.NamespacedName{}, fmt.Errorf("resolve runtime namespace: %w", err)
	}
	configMapName := flag.Lookup("configmap")
	return restConfig, types.NamespacedName{Namespace: namespace, Name: configMapName.Value.String()}, nil
}

func loadRuntimeNamespace() (string, error) {
	return controller.ResolveRuntimeNamespace()
}

func newBootstrapManager(restConfig *rest.Config) (ctrl.Manager, error) {
	return ctrl.NewManager(rest.CopyConfig(restConfig), ctrl.Options{Scheme: controller.NewScheme()})
}

func loadBootstrapRuntimeConfig(ctx context.Context, kubeClient client.Client, configKey types.NamespacedName) (controller.RuntimeConfig, error) {
	return controller.LoadRuntimeConfig(ctx, kubeClient, configKey)
}

func prepareRuntimeState(ctx context.Context, logger *slog.Logger, kubeClient client.Client, configKey types.NamespacedName, runtimeConfig controller.RuntimeConfig) (*controller.ConfigStore, *controller.ResourceCache, error) {
	configStore := controller.NewConfigStore(configKey, logger)
	configStore.Set(runtimeConfig)
	resourceCache := controller.NewResourceCache()
	if err := controller.WarmResourceCache(ctx, kubeClient, resourceCache); err != nil {
		return nil, nil, fmt.Errorf("warm resource cache: %w", err)
	}
	return configStore, resourceCache, nil
}

func setupManager(mgr ctrl.Manager, operatorConfig controller.OperatorConfig, resourceCache *controller.ResourceCache, configStore *controller.ConfigStore, configKey types.NamespacedName) error {
	if err := controller.SetupWithManager(mgr, operatorConfig, resourceCache); err != nil {
		return fmt.Errorf("setup controllers: %w", err)
	}
	if err := (&controller.ConfigMapReconciler{Client: mgr.GetClient(), Key: configKey, Store: configStore}).SetupControllerWithManager(mgr); err != nil {
		return fmt.Errorf("setup configmap controller: %w", err)
	}
	if err := mgr.AddHealthzCheck("healthz", healthz.Ping); err != nil {
		return fmt.Errorf("add healthz check: %w", err)
	}
	if err := mgr.AddReadyzCheck("readyz", healthz.Ping); err != nil {
		return fmt.Errorf("add readyz check: %w", err)
	}
	return nil
}

func serveAPI(ctx context.Context, logger *slog.Logger, api sandboxpb.SandboxServiceServer) error {
	grpcAddress := envOrDefault("SANDBOX_GRPC_ADDR", ":9090")
	httpAddress := envOrDefault("SANDBOX_HTTP_ADDR", ":8082")

	grpcListener, err := net.Listen("tcp", grpcAddress)
	if err != nil {
		return fmt.Errorf("listen grpc address %s: %w", grpcAddress, err)
	}

	grpcServer := grpc.NewServer()
	sandboxpb.RegisterSandboxServiceServer(grpcServer, api)
	reflection.Register(grpcServer)

	mux := runtime.NewServeMux()
	if err := sandboxpb.RegisterSandboxServiceHandlerServer(ctx, mux, api); err != nil {
		return fmt.Errorf("register grpc gateway handlers: %w", err)
	}

	httpServer := &http.Server{
		Addr:    httpAddress,
		Handler: mux,
	}

	go func() {
		<-ctx.Done()
		_ = httpServer.Shutdown(context.Background())
		grpcServer.GracefulStop()
	}()

	grpcErrCh := make(chan error, 1)
	httpErrCh := make(chan error, 1)

	go func() {
		logger.InfoContext(ctx, "starting grpc api", slog.String("addr", grpcAddress))
		grpcErrCh <- grpcServer.Serve(grpcListener)
	}()

	go func() {
		logger.InfoContext(ctx, "starting http api", slog.String("addr", httpAddress))
		httpErrCh <- httpServer.ListenAndServe()
	}()

	select {
	case err := <-grpcErrCh:
		return err
	case err := <-httpErrCh:
		if errors.Is(err, http.ErrServerClosed) {
			return nil
		}
		return err
	case <-ctx.Done():
		return nil
	}
}

func envOrDefault(key, fallback string) string {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	return value
}
