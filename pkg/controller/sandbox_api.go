package controller

import (
	"context"
	"errors"
	"fmt"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/utils/ptr"
	"sigs.k8s.io/controller-runtime/pkg/client"

	extensionsv1alpha1 "sigs.k8s.io/agent-sandbox/extensions/api/v1alpha1"

	sandboxpb "github.com/yylt/agentsandbox/internal/pkg/api/pb/sandbox/v1"
	"google.golang.org/protobuf/types/known/emptypb"
)

var ErrUnsupportedKind = errors.New("unsupported resource kind")

var (
	ErrResourceRequired       = errors.New("resource is required")
	ErrClaimRequired          = errors.New("claim is required")
	ErrClaimTemplateRequired  = errors.New("claim template is required")
	ErrClaimMetadataRequired  = errors.New("claim metadata is required")
	ErrSandboxTemplateMissing = errors.New("sandbox template not found")
	ErrSandboxWarmPoolMissing = errors.New("sandbox warm pool not found")
)

type Metadata struct {
	Name        string
	Namespace   string
	Labels      map[string]string
	Annotations map[string]string
}

type SandboxAPI interface {
	CreateResource(context.Context, *sandboxpb.CreateResourceRequest) (*sandboxpb.ResourceResponse, error)
	GetResource(context.Context, *sandboxpb.GetResourceRequest) (*sandboxpb.ResourceResponse, error)
	ListResources(context.Context, *sandboxpb.ListResourcesRequest) (*sandboxpb.ListResourcesResponse, error)
	UpdateResource(context.Context, *sandboxpb.UpdateResourceRequest) (*sandboxpb.ResourceResponse, error)
	DeleteResource(context.Context, *sandboxpb.DeleteResourceRequest) (*emptypb.Empty, error)
}

type ResourceManager struct {
	client client.Client
	scheme *runtime.Scheme
	cache  *ResourceCache
	config *ConfigStore
	sandboxpb.UnimplementedSandboxServiceServer
}

func NewSandboxAPI(kubeClient client.Client, scheme *runtime.Scheme, cache *ResourceCache, config *ConfigStore) *ResourceManager {
	return &ResourceManager{client: kubeClient, scheme: scheme, cache: cache, config: config}
}

func (m *ResourceManager) CreateResource(ctx context.Context, req *sandboxpb.CreateResourceRequest) (*sandboxpb.ResourceResponse, error) {
	claim, err := m.claimFromRequest(req.GetResource())
	if err != nil {
		return nil, err
	}
	if err := m.client.Create(ctx, claim); err != nil {
		return nil, fmt.Errorf("create resource: %w", err)
	}
	m.cache.UpsertClaim(claim)
	return m.toResourceResponse(claim)
}

func (m *ResourceManager) GetResource(ctx context.Context, req *sandboxpb.GetResourceRequest) (*sandboxpb.ResourceResponse, error) {
	if req.GetKind() != sandboxpb.ResourceKind_RESOURCE_KIND_CLAIM {
		return nil, ErrUnsupportedKind
	}
	if claim, ok := m.cache.GetClaim(req.GetNamespace(), req.GetName()); ok {
		return m.toResourceResponse(claim)
	}

	claim := &extensionsv1alpha1.SandboxClaim{}
	if err := m.client.Get(ctx, types.NamespacedName{Name: req.GetName(), Namespace: req.GetNamespace()}, claim); err != nil {
		return nil, fmt.Errorf("get resource: %w", err)
	}
	m.cache.UpsertClaim(claim)
	return m.toResourceResponse(claim)
}

func (m *ResourceManager) ListResources(ctx context.Context, req *sandboxpb.ListResourcesRequest) (*sandboxpb.ListResourcesResponse, error) {
	if req.GetKind() != sandboxpb.ResourceKind_RESOURCE_KIND_CLAIM {
		return nil, ErrUnsupportedKind
	}

	claims := m.cache.ListClaims(req.GetNamespace())
	if len(claims) == 0 {
		list := &extensionsv1alpha1.SandboxClaimList{}
		if err := m.client.List(ctx, list, client.InNamespace(req.GetNamespace())); err != nil {
			return nil, fmt.Errorf("list claim resources: %w", err)
		}
		claims = make([]*extensionsv1alpha1.SandboxClaim, 0, len(list.Items))
		for i := range list.Items {
			claim := list.Items[i].DeepCopy()
			m.cache.UpsertClaim(claim)
			claims = append(claims, claim)
		}
	}

	resources := make([]*sandboxpb.ManagedResource, 0, len(claims))
	for _, claim := range claims {
		managed, err := m.toManagedResource(claim)
		if err != nil {
			return nil, err
		}
		resources = append(resources, managed)
	}
	return &sandboxpb.ListResourcesResponse{Resources: resources}, nil
}

func (m *ResourceManager) UpdateResource(ctx context.Context, req *sandboxpb.UpdateResourceRequest) (*sandboxpb.ResourceResponse, error) {
	claim, err := m.claimFromRequest(req.GetResource())
	if err != nil {
		return nil, err
	}
	if err := m.client.Update(ctx, claim); err != nil {
		return nil, fmt.Errorf("update resource: %w", err)
	}
	m.cache.UpsertClaim(claim)
	return m.toResourceResponse(claim)
}

func (m *ResourceManager) DeleteResource(ctx context.Context, req *sandboxpb.DeleteResourceRequest) (*emptypb.Empty, error) {
	if req.GetKind() != sandboxpb.ResourceKind_RESOURCE_KIND_CLAIM {
		return nil, ErrUnsupportedKind
	}
	claim := &extensionsv1alpha1.SandboxClaim{}
	claim.SetName(req.GetName())
	claim.SetNamespace(req.GetNamespace())
	if err := m.client.Delete(ctx, claim); err != nil {
		return nil, fmt.Errorf("delete resource: %w", err)
	}
	m.cache.DeleteClaim(req.GetNamespace(), req.GetName())
	return &emptypb.Empty{}, nil
}

func (m *ResourceManager) claimFromRequest(resource *sandboxpb.ManagedResource) (*extensionsv1alpha1.SandboxClaim, error) {
	if resource == nil {
		return nil, ErrResourceRequired
	}
	if resource.GetKind() != sandboxpb.ResourceKind_RESOURCE_KIND_CLAIM {
		return nil, ErrUnsupportedKind
	}
	claim, err := claimFromProto(resource.GetClaim())
	if err != nil {
		return nil, err
	}
	m.applyClaimDefaults(claim)
	if err := m.validateClaim(claim); err != nil {
		return nil, err
	}
	return claim, nil
}

func (m *ResourceManager) applyClaimDefaults(claim *extensionsv1alpha1.SandboxClaim) {
	if claim == nil {
		return
	}
	config := m.config.Get()
	if claim.Spec.TemplateRef.Name == "" {
		claim.Spec.TemplateRef.Name = config.DefaultSandboxTemplate
	}
	if claim.Spec.WarmPool == nil && config.DefaultSandboxWarmPool != "" {
		policy := extensionsv1alpha1.WarmPoolPolicy(config.DefaultSandboxWarmPool)
		claim.Spec.WarmPool = &policy
	}
	if claim.Labels == nil {
		claim.Labels = make(map[string]string)
	}
	claim.Labels[config.ManagedLabelKey] = config.ManagedLabelValue
}

func (m *ResourceManager) validateClaim(claim *extensionsv1alpha1.SandboxClaim) error {
	if claim == nil {
		return ErrClaimRequired
	}
	if claim.Spec.TemplateRef.Name == "" {
		return ErrClaimTemplateRequired
	}
	if !m.cache.HasTemplate(claim.Namespace, claim.Spec.TemplateRef.Name) {
		return fmt.Errorf("%w: %s/%s", ErrSandboxTemplateMissing, claim.Namespace, claim.Spec.TemplateRef.Name)
	}
	if claim.Spec.WarmPool != nil && !m.cache.HasWarmPool(claim.Namespace, string(*claim.Spec.WarmPool)) {
		return fmt.Errorf("%w: %s/%s", ErrSandboxWarmPoolMissing, claim.Namespace, string(*claim.Spec.WarmPool))
	}
	return nil
}

func (m *ResourceManager) toResourceResponse(obj client.Object) (*sandboxpb.ResourceResponse, error) {
	resource, err := m.toManagedResource(obj)
	if err != nil {
		return nil, err
	}
	return &sandboxpb.ResourceResponse{Resource: resource}, nil
}

func (m *ResourceManager) toManagedResource(obj client.Object) (*sandboxpb.ManagedResource, error) {
	claim, ok := obj.(*extensionsv1alpha1.SandboxClaim)
	if !ok {
		return nil, ErrUnsupportedKind
	}
	return &sandboxpb.ManagedResource{
		Kind: sandboxpb.ResourceKind_RESOURCE_KIND_CLAIM,
		Resource: &sandboxpb.ManagedResource_Claim{
			Claim: claimToProto(claim),
		},
	}, nil
}

func claimFromProto(resource *sandboxpb.SandboxClaimResource) (*extensionsv1alpha1.SandboxClaim, error) {
	if resource == nil || resource.GetMetadata() == nil {
		return nil, ErrClaimMetadataRequired
	}
	lifecycle := claimLifecycleFromProto(resource.GetShutdownTime(), resource.GetTtlSecondsAfterFinished(), resource.GetShutdownPolicy())
	claim := &extensionsv1alpha1.SandboxClaim{
		TypeMeta:   metav1.TypeMeta{APIVersion: extensionsv1alpha1.GroupVersion.String(), Kind: "SandboxClaim"},
		ObjectMeta: DefaultSandboxObjectMeta(metadataFromProto(resource.GetMetadata())),
		Spec: extensionsv1alpha1.SandboxClaimSpec{
			TemplateRef: extensionsv1alpha1.SandboxTemplateRef{Name: resource.GetTemplateName()},
			Lifecycle:   lifecycle,
			Env:         envVarsFromProto(resource.GetEnv()),
		},
	}
	if resource.GetWarmPoolName() != "" {
		policy := extensionsv1alpha1.WarmPoolPolicy(resource.GetWarmPoolName())
		claim.Spec.WarmPool = &policy
	}
	return claim, nil
}

func claimToProto(resource *extensionsv1alpha1.SandboxClaim) *sandboxpb.SandboxClaimResource {
	resp := &sandboxpb.SandboxClaimResource{
		Metadata:     metadataToProto(resource.Name, resource.Namespace, resource.Labels, resource.Annotations),
		TemplateName: resource.Spec.TemplateRef.Name,
		Env:          envVarsToProto(resource.Spec.Env),
		SandboxName:  resource.Status.SandboxStatus.Name,
		PodIps:       resource.Status.SandboxStatus.PodIPs,
	}
	if resource.Spec.Lifecycle != nil {
		resp.ShutdownPolicy = claimShutdownPolicyToProto(resource.Spec.Lifecycle.ShutdownPolicy)
		if resource.Spec.Lifecycle.TTLSecondsAfterFinished != nil {
			resp.TtlSecondsAfterFinished = *resource.Spec.Lifecycle.TTLSecondsAfterFinished
		}
	}
	if resource.Spec.WarmPool != nil {
		resp.WarmPoolName = string(*resource.Spec.WarmPool)
	}
	return resp
}

func metadataFromProto(meta *sandboxpb.Metadata) Metadata {
	return Metadata{
		Name:        meta.GetName(),
		Namespace:   meta.GetNamespace(),
		Labels:      meta.GetLabels(),
		Annotations: meta.GetAnnotations(),
	}
}

func metadataToProto(name, namespace string, labels, annotations map[string]string) *sandboxpb.Metadata {
	return &sandboxpb.Metadata{Name: name, Namespace: namespace, Labels: labels, Annotations: annotations}
}

func envVarsFromProto(items []*sandboxpb.EnvVar) []extensionsv1alpha1.EnvVar {
	result := make([]extensionsv1alpha1.EnvVar, 0, len(items))
	for _, item := range items {
		if item == nil {
			continue
		}
		result = append(result, extensionsv1alpha1.EnvVar{Name: item.GetName(), Value: item.GetValue(), ContainerName: item.GetContainerName()})
	}
	return result
}

func envVarsToProto(items []extensionsv1alpha1.EnvVar) []*sandboxpb.EnvVar {
	result := make([]*sandboxpb.EnvVar, 0, len(items))
	for _, item := range items {
		result = append(result, &sandboxpb.EnvVar{Name: item.Name, Value: item.Value, ContainerName: item.ContainerName})
	}
	return result
}

func claimLifecycleFromProto(shutdownTime string, ttl int32, policy sandboxpb.ShutdownPolicy) *extensionsv1alpha1.Lifecycle {
	lifecycle := &extensionsv1alpha1.Lifecycle{ShutdownPolicy: claimShutdownPolicyFromProto(policy)}
	if shutdownTime != "" {
		lifecycle.ShutdownTime = &metav1.Time{}
		_ = lifecycle.ShutdownTime.UnmarshalQueryParameter(shutdownTime)
	}
	if ttl > 0 {
		lifecycle.TTLSecondsAfterFinished = ptr.To(ttl)
	}
	return lifecycle
}

func claimShutdownPolicyFromProto(policy sandboxpb.ShutdownPolicy) extensionsv1alpha1.ShutdownPolicy {
	switch policy {
	case sandboxpb.ShutdownPolicy_SHUTDOWN_POLICY_UNSPECIFIED:
		return extensionsv1alpha1.ShutdownPolicyRetain
	case sandboxpb.ShutdownPolicy_SHUTDOWN_POLICY_RETAIN:
		return extensionsv1alpha1.ShutdownPolicyRetain
	case sandboxpb.ShutdownPolicy_SHUTDOWN_POLICY_DELETE:
		return extensionsv1alpha1.ShutdownPolicyDelete
	case sandboxpb.ShutdownPolicy_SHUTDOWN_POLICY_DELETE_FOREGROUND:
		return extensionsv1alpha1.ShutdownPolicyDeleteForeground
	default:
		return extensionsv1alpha1.ShutdownPolicyRetain
	}
}

func claimShutdownPolicyToProto(policy extensionsv1alpha1.ShutdownPolicy) sandboxpb.ShutdownPolicy {
	switch policy {
	case extensionsv1alpha1.ShutdownPolicyRetain:
		return sandboxpb.ShutdownPolicy_SHUTDOWN_POLICY_RETAIN
	case extensionsv1alpha1.ShutdownPolicyDelete:
		return sandboxpb.ShutdownPolicy_SHUTDOWN_POLICY_DELETE
	case extensionsv1alpha1.ShutdownPolicyDeleteForeground:
		return sandboxpb.ShutdownPolicy_SHUTDOWN_POLICY_DELETE_FOREGROUND
	default:
		return sandboxpb.ShutdownPolicy_SHUTDOWN_POLICY_RETAIN
	}
}
