package controller

import (
	"context"
	"fmt"
	"sync"

	corev1 "k8s.io/api/core/v1"
	networkingv1 "k8s.io/api/networking/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/util/intstr"
	utilruntime "k8s.io/apimachinery/pkg/util/runtime"
	clientgoscheme "k8s.io/client-go/kubernetes/scheme"
	"k8s.io/client-go/tools/events"
	ctrl "sigs.k8s.io/controller-runtime"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/controller"
	"sigs.k8s.io/controller-runtime/pkg/controller/controllerutil"
	"sigs.k8s.io/controller-runtime/pkg/log"

	agentsv1alpha1 "sigs.k8s.io/agent-sandbox/api/v1alpha1"
	extensionsv1alpha1 "sigs.k8s.io/agent-sandbox/extensions/api/v1alpha1"
)

const sandboxTemplateRefHashLabel = "agents.x-k8s.io/sandbox-template-ref-hash"

type OperatorConfig struct {
	ClusterDomain                 string
	EnableExtensions              bool
	SandboxConcurrentWorkers      int
	SandboxClaimConcurrentWorkers int
	SandboxWarmPoolWorkers        int
	SandboxTemplateWorkers        int
}

type CacheEntry struct {
	Namespace string
	Name      string
}

type ResourceCache struct {
	mu        sync.RWMutex
	sandboxes map[CacheEntry]*agentsv1alpha1.Sandbox
	templates map[CacheEntry]*extensionsv1alpha1.SandboxTemplate
	warmPools map[CacheEntry]*extensionsv1alpha1.SandboxWarmPool
	claims    map[CacheEntry]*extensionsv1alpha1.SandboxClaim
}

func NewResourceCache() *ResourceCache {
	return &ResourceCache{
		sandboxes: make(map[CacheEntry]*agentsv1alpha1.Sandbox),
		templates: make(map[CacheEntry]*extensionsv1alpha1.SandboxTemplate),
		warmPools: make(map[CacheEntry]*extensionsv1alpha1.SandboxWarmPool),
		claims:    make(map[CacheEntry]*extensionsv1alpha1.SandboxClaim),
	}
}

func (c *ResourceCache) UpsertSandbox(obj *agentsv1alpha1.Sandbox) {
	if obj == nil {
		return
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	c.sandboxes[cacheKey(obj.GetNamespace(), obj.GetName())] = obj.DeepCopy()
}

func (c *ResourceCache) DeleteSandbox(namespace, name string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	delete(c.sandboxes, cacheKey(namespace, name))
}

func (c *ResourceCache) HasSandbox(namespace, name string) bool {
	c.mu.RLock()
	defer c.mu.RUnlock()
	_, ok := c.sandboxes[cacheKey(namespace, name)]
	return ok
}

func (c *ResourceCache) UpsertTemplate(obj *extensionsv1alpha1.SandboxTemplate) {
	if obj == nil {
		return
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	c.templates[cacheKey(obj.GetNamespace(), obj.GetName())] = obj.DeepCopy()
}

func (c *ResourceCache) DeleteTemplate(namespace, name string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	delete(c.templates, cacheKey(namespace, name))
}

func (c *ResourceCache) HasTemplate(namespace, name string) bool {
	c.mu.RLock()
	defer c.mu.RUnlock()
	_, ok := c.templates[cacheKey(namespace, name)]
	return ok
}

func (c *ResourceCache) UpsertWarmPool(obj *extensionsv1alpha1.SandboxWarmPool) {
	if obj == nil {
		return
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	c.warmPools[cacheKey(obj.GetNamespace(), obj.GetName())] = obj.DeepCopy()
}

func (c *ResourceCache) DeleteWarmPool(namespace, name string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	delete(c.warmPools, cacheKey(namespace, name))
}

func (c *ResourceCache) HasWarmPool(namespace, name string) bool {
	c.mu.RLock()
	defer c.mu.RUnlock()
	_, ok := c.warmPools[cacheKey(namespace, name)]
	return ok
}

func (c *ResourceCache) UpsertClaim(obj *extensionsv1alpha1.SandboxClaim) {
	if obj == nil {
		return
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	c.claims[cacheKey(obj.GetNamespace(), obj.GetName())] = obj.DeepCopy()
}

func (c *ResourceCache) DeleteClaim(namespace, name string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	delete(c.claims, cacheKey(namespace, name))
}

func (c *ResourceCache) GetClaim(namespace, name string) (*extensionsv1alpha1.SandboxClaim, bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	claim, ok := c.claims[cacheKey(namespace, name)]
	if !ok {
		return nil, false
	}
	return claim.DeepCopy(), true
}

func (c *ResourceCache) HasClaim(namespace, name string) bool {
	c.mu.RLock()
	defer c.mu.RUnlock()
	_, ok := c.claims[cacheKey(namespace, name)]
	return ok
}

func (c *ResourceCache) ListClaims(namespace string) []*extensionsv1alpha1.SandboxClaim {
	c.mu.RLock()
	defer c.mu.RUnlock()
	claims := make([]*extensionsv1alpha1.SandboxClaim, 0)
	for key, claim := range c.claims {
		if namespace != "" && key.Namespace != namespace {
			continue
		}
		claims = append(claims, claim.DeepCopy())
	}
	return claims
}

func cacheKey(namespace, name string) CacheEntry {
	return CacheEntry{Namespace: namespace, Name: name}
}

func DefaultOperatorConfig() OperatorConfig {
	return OperatorConfig{
		ClusterDomain:                 "cluster.local",
		EnableExtensions:              true,
		SandboxConcurrentWorkers:      1,
		SandboxClaimConcurrentWorkers: 1,
		SandboxWarmPoolWorkers:        1,
		SandboxTemplateWorkers:        1,
	}
}

func NewScheme() *runtime.Scheme {
	scheme := runtime.NewScheme()
	utilruntime.Must(clientgoscheme.AddToScheme(scheme))
	utilruntime.Must(agentsv1alpha1.AddToScheme(scheme))
	utilruntime.Must(extensionsv1alpha1.AddToScheme(scheme))
	return scheme
}

func SetupWithManager(mgr ctrl.Manager, cfg OperatorConfig, cache *ResourceCache) error {
	if err := (&SandboxReconciler{
		Client:        mgr.GetClient(),
		Scheme:        mgr.GetScheme(),
		ClusterDomain: cfg.ClusterDomain,
		Cache:         cache,
	}).SetupWithManager(mgr, cfg.SandboxConcurrentWorkers); err != nil {
		return fmt.Errorf("setup sandbox reconciler: %w", err)
	}

	if !cfg.EnableExtensions {
		return nil
	}

	if err := (&SandboxTemplateReconciler{
		Client:   mgr.GetClient(),
		Scheme:   mgr.GetScheme(),
		Recorder: mgr.GetEventRecorder("sandboxtemplate-controller"),
		Cache:    cache,
	}).SetupWithManager(mgr, cfg.SandboxTemplateWorkers); err != nil {
		return fmt.Errorf("setup sandbox template reconciler: %w", err)
	}

	if err := (&SandboxClaimReconciler{
		Client:   mgr.GetClient(),
		Scheme:   mgr.GetScheme(),
		Recorder: mgr.GetEventRecorder("sandboxclaim-controller"),
		Cache:    cache,
	}).SetupWithManager(mgr, cfg.SandboxClaimConcurrentWorkers); err != nil {
		return fmt.Errorf("setup sandbox claim reconciler: %w", err)
	}

	if err := (&SandboxWarmPoolReconciler{
		Client: mgr.GetClient(),
		Scheme: mgr.GetScheme(),
		Cache:  cache,
	}).SetupWithManager(mgr, cfg.SandboxWarmPoolWorkers); err != nil {
		return fmt.Errorf("setup sandbox warm pool reconciler: %w", err)
	}

	return nil
}

func WarmResourceCache(ctx context.Context, kubeClient client.Client, cache *ResourceCache) error {
	if cache == nil {
		return nil
	}

	sandboxes := &agentsv1alpha1.SandboxList{}
	if err := kubeClient.List(ctx, sandboxes); err != nil {
		return fmt.Errorf("list sandboxes: %w", err)
	}
	for i := range sandboxes.Items {
		cache.UpsertSandbox(&sandboxes.Items[i])
	}

	templates := &extensionsv1alpha1.SandboxTemplateList{}
	if err := kubeClient.List(ctx, templates); err != nil {
		return fmt.Errorf("list sandbox templates: %w", err)
	}
	for i := range templates.Items {
		cache.UpsertTemplate(&templates.Items[i])
	}

	warmPools := &extensionsv1alpha1.SandboxWarmPoolList{}
	if err := kubeClient.List(ctx, warmPools); err != nil {
		return fmt.Errorf("list sandbox warm pools: %w", err)
	}
	for i := range warmPools.Items {
		cache.UpsertWarmPool(&warmPools.Items[i])
	}

	claims := &extensionsv1alpha1.SandboxClaimList{}
	if err := kubeClient.List(ctx, claims); err != nil {
		return fmt.Errorf("list sandbox claims: %w", err)
	}
	for i := range claims.Items {
		cache.UpsertClaim(&claims.Items[i])
	}

	return nil
}

type SandboxReconciler struct {
	client.Client
	Scheme        *runtime.Scheme
	ClusterDomain string
	Cache         *ResourceCache
}

func (r *SandboxReconciler) Reconcile(ctx context.Context, req ctrl.Request) (ctrl.Result, error) {
	logger := log.FromContext(ctx)
	sandbox := &agentsv1alpha1.Sandbox{}
	if err := r.Get(ctx, req.NamespacedName, sandbox); err != nil {
		if client.IgnoreNotFound(err) == nil && r.Cache != nil {
			r.Cache.DeleteSandbox(req.Namespace, req.Name)
		}
		return ctrl.Result{}, client.IgnoreNotFound(err)
	}

	if !sandbox.DeletionTimestamp.IsZero() {
		if r.Cache != nil {
			r.Cache.DeleteSandbox(sandbox.Namespace, sandbox.Name)
		}
		return ctrl.Result{}, nil
	}

	service := &corev1.Service{ObjectMeta: metav1.ObjectMeta{Name: sandbox.Name, Namespace: sandbox.Namespace}}
	_, err := controllerutil.CreateOrUpdate(ctx, r.Client, service, func() error {
		if err := controllerutil.SetControllerReference(sandbox, service, r.Scheme); err != nil {
			return err
		}
		labels := map[string]string{"app.kubernetes.io/name": sandbox.Name}
		service.Labels = labels
		service.Spec.Selector = labels
		service.Spec.Ports = []corev1.ServicePort{{Name: "default", Port: 80, TargetPort: intstrFromFirstPort(sandbox.Spec.PodTemplate.Spec.Containers)}}
		return nil
	})
	if err != nil {
		return ctrl.Result{}, err
	}

	sandbox.Status.Service = service.Name
	sandbox.Status.ServiceFQDN = fmt.Sprintf("%s.%s.svc.%s", service.Name, service.Namespace, r.ClusterDomain)
	if err := r.Status().Update(ctx, sandbox); err != nil {
		logger.Error(err, "update sandbox status")
		return ctrl.Result{}, err
	}
	if r.Cache != nil {
		r.Cache.UpsertSandbox(sandbox)
	}

	return ctrl.Result{}, nil
}

func (r *SandboxReconciler) SetupWithManager(mgr ctrl.Manager, workers int) error {
	return ctrl.NewControllerManagedBy(mgr).
		For(&agentsv1alpha1.Sandbox{}).
		Owns(&corev1.Service{}).
		WithOptions(controller.Options{MaxConcurrentReconciles: workers}).
		Complete(r)
}

type SandboxTemplateReconciler struct {
	client.Client
	Scheme   *runtime.Scheme
	Recorder events.EventRecorder
	Cache    *ResourceCache
}

func (r *SandboxTemplateReconciler) Reconcile(ctx context.Context, req ctrl.Request) (ctrl.Result, error) {
	template := &extensionsv1alpha1.SandboxTemplate{}
	if handled, err := r.getTemplate(ctx, req, template); handled {
		return ctrl.Result{}, err
	}
	if !template.DeletionTimestamp.IsZero() {
		if r.Cache != nil {
			r.Cache.DeleteTemplate(template.Namespace, template.Name)
		}
		return ctrl.Result{}, nil
	}

	if template.Spec.NetworkPolicyManagement == extensionsv1alpha1.NetworkPolicyManagementUnmanaged {
		return ctrl.Result{}, nil
	}

	networkPolicy := &networkingv1.NetworkPolicy{ObjectMeta: metav1.ObjectMeta{Name: template.Name + "-network-policy", Namespace: template.Namespace}}
	_, err := controllerutil.CreateOrUpdate(ctx, r.Client, networkPolicy, func() error {
		if err := controllerutil.SetControllerReference(template, networkPolicy, r.Scheme); err != nil {
			return err
		}
		networkPolicy.Spec.PodSelector.MatchLabels = map[string]string{sandboxTemplateRefHashLabel: template.Name}
		networkPolicy.Spec.PolicyTypes = []networkingv1.PolicyType{networkingv1.PolicyTypeIngress, networkingv1.PolicyTypeEgress}
		networkPolicy.Spec.Ingress = nil
		networkPolicy.Spec.Egress = nil
		if template.Spec.NetworkPolicy != nil {
			networkPolicy.Spec.Ingress = template.Spec.NetworkPolicy.Ingress
			networkPolicy.Spec.Egress = template.Spec.NetworkPolicy.Egress
		}
		return nil
	})
	if err == nil && r.Cache != nil {
		r.Cache.UpsertTemplate(template)
	}
	return ctrl.Result{}, err
}

func (r *SandboxTemplateReconciler) getTemplate(ctx context.Context, req ctrl.Request, template *extensionsv1alpha1.SandboxTemplate) (bool, error) {
	if err := r.Get(ctx, req.NamespacedName, template); err != nil {
		if client.IgnoreNotFound(err) == nil && r.Cache != nil {
			r.Cache.DeleteTemplate(req.Namespace, req.Name)
		}
		return true, client.IgnoreNotFound(err)
	}
	return false, nil
}

func (r *SandboxTemplateReconciler) SetupWithManager(mgr ctrl.Manager, workers int) error {
	return ctrl.NewControllerManagedBy(mgr).
		For(&extensionsv1alpha1.SandboxTemplate{}).
		Owns(&networkingv1.NetworkPolicy{}).
		WithOptions(controller.Options{MaxConcurrentReconciles: workers}).
		Complete(r)
}

type SandboxClaimReconciler struct {
	client.Client
	Scheme   *runtime.Scheme
	Recorder events.EventRecorder
	Cache    *ResourceCache
}

func (r *SandboxClaimReconciler) Reconcile(ctx context.Context, req ctrl.Request) (ctrl.Result, error) {
	claim := &extensionsv1alpha1.SandboxClaim{}
	if handled, err := r.getClaim(ctx, req, claim); handled {
		return ctrl.Result{}, err
	}
	if !claim.DeletionTimestamp.IsZero() {
		if r.Cache != nil {
			r.Cache.DeleteClaim(claim.Namespace, claim.Name)
		}
		return ctrl.Result{}, nil
	}

	template := &extensionsv1alpha1.SandboxTemplate{}
	if err := r.Get(ctx, client.ObjectKey{Name: claim.Spec.TemplateRef.Name, Namespace: claim.Namespace}, template); err != nil {
		return ctrl.Result{}, err
	}

	sandbox := &agentsv1alpha1.Sandbox{ObjectMeta: metav1.ObjectMeta{Name: claim.Name, Namespace: claim.Namespace}}
	_, err := controllerutil.CreateOrUpdate(ctx, r.Client, sandbox, func() error {
		if err := controllerutil.SetControllerReference(claim, sandbox, r.Scheme); err != nil {
			return err
		}
		sandbox.Spec.PodTemplate = template.Spec.PodTemplate
		sandbox.Spec.VolumeClaimTemplates = template.Spec.VolumeClaimTemplates
		sandbox.Spec.Replicas = ptrInt32(1)
		return nil
	})
	if err != nil {
		return ctrl.Result{}, err
	}

	claim.Status.SandboxStatus.Name = sandbox.Name
	if err := r.Status().Update(ctx, claim); err != nil {
		return ctrl.Result{}, err
	}
	if r.Cache != nil {
		r.Cache.UpsertClaim(claim)
	}

	return ctrl.Result{}, nil
}

func (r *SandboxClaimReconciler) getClaim(ctx context.Context, req ctrl.Request, claim *extensionsv1alpha1.SandboxClaim) (bool, error) {
	if err := r.Get(ctx, req.NamespacedName, claim); err != nil {
		if client.IgnoreNotFound(err) == nil && r.Cache != nil {
			r.Cache.DeleteClaim(req.Namespace, req.Name)
		}
		return true, client.IgnoreNotFound(err)
	}
	return false, nil
}

func (r *SandboxClaimReconciler) SetupWithManager(mgr ctrl.Manager, workers int) error {
	return ctrl.NewControllerManagedBy(mgr).
		For(&extensionsv1alpha1.SandboxClaim{}).
		Owns(&agentsv1alpha1.Sandbox{}).
		WithOptions(controller.Options{MaxConcurrentReconciles: workers}).
		Complete(r)
}

type SandboxWarmPoolReconciler struct {
	client.Client
	Scheme *runtime.Scheme
	Cache  *ResourceCache
}

func (r *SandboxWarmPoolReconciler) Reconcile(ctx context.Context, req ctrl.Request) (ctrl.Result, error) {
	warmPool := &extensionsv1alpha1.SandboxWarmPool{}
	if handled, err := r.getWarmPool(ctx, req, warmPool); handled {
		return ctrl.Result{}, err
	}
	if !warmPool.DeletionTimestamp.IsZero() {
		if r.Cache != nil {
			r.Cache.DeleteWarmPool(warmPool.Namespace, warmPool.Name)
		}
		return ctrl.Result{}, nil
	}

	for i := int32(0); i < warmPool.Spec.Replicas; i++ {
		name := fmt.Sprintf("%s-%d", warmPool.Name, i)
		sandbox := &agentsv1alpha1.Sandbox{ObjectMeta: metav1.ObjectMeta{Name: name, Namespace: warmPool.Namespace}}
		_, err := controllerutil.CreateOrUpdate(ctx, r.Client, sandbox, func() error {
			if err := controllerutil.SetControllerReference(warmPool, sandbox, r.Scheme); err != nil {
				return err
			}
			sandbox.Spec.Replicas = ptrInt32(1)
			return nil
		})
		if err != nil {
			return ctrl.Result{}, err
		}
	}

	warmPool.Status.Replicas = warmPool.Spec.Replicas
	warmPool.Status.ReadyReplicas = warmPool.Spec.Replicas
	if err := r.Status().Update(ctx, warmPool); err != nil {
		return ctrl.Result{}, err
	}
	if r.Cache != nil {
		r.Cache.UpsertWarmPool(warmPool)
	}

	return ctrl.Result{}, nil
}

func (r *SandboxWarmPoolReconciler) getWarmPool(ctx context.Context, req ctrl.Request, warmPool *extensionsv1alpha1.SandboxWarmPool) (bool, error) {
	if err := r.Get(ctx, req.NamespacedName, warmPool); err != nil {
		if client.IgnoreNotFound(err) == nil && r.Cache != nil {
			r.Cache.DeleteWarmPool(req.Namespace, req.Name)
		}
		return true, client.IgnoreNotFound(err)
	}
	return false, nil
}

func (r *SandboxWarmPoolReconciler) SetupWithManager(mgr ctrl.Manager, workers int) error {
	return ctrl.NewControllerManagedBy(mgr).
		For(&extensionsv1alpha1.SandboxWarmPool{}).
		Owns(&agentsv1alpha1.Sandbox{}).
		WithOptions(controller.Options{MaxConcurrentReconciles: workers}).
		Complete(r)
}

func DefaultSandboxObjectMeta(meta Metadata) metav1.ObjectMeta {
	return metav1.ObjectMeta{
		Name:        meta.Name,
		Namespace:   meta.Namespace,
		Labels:      meta.Labels,
		Annotations: meta.Annotations,
	}
}

func intstrFromFirstPort(containers []corev1.Container) intstr.IntOrString {
	for _, container := range containers {
		for _, port := range container.Ports {
			if port.ContainerPort > 0 {
				return intstr.FromInt32(port.ContainerPort)
			}
		}
	}
	return intstr.FromInt(80)
}

func ptrInt32(value int32) *int32 {
	return &value
}
