package provider

import (
	"context"
	"fmt"

	"github.com/hashicorp/terraform-plugin-framework/resource"
	"github.com/hashicorp/terraform-plugin-framework/resource/schema"
	"github.com/hashicorp/terraform-plugin-framework/resource/schema/planmodifier"
	"github.com/hashicorp/terraform-plugin-framework/resource/schema/stringplanmodifier"
	"github.com/hashicorp/terraform-plugin-framework/types"
)

var _ resource.Resource = &instanceResource{}

type instanceResource struct {
	client *Client
}

type instanceModel struct {
	ID           types.String `tfsdk:"id"`
	ManifestPath types.String `tfsdk:"manifest_path"`
	Phase        types.String `tfsdk:"phase"`
	InstanceURL  types.String `tfsdk:"instance_url"`
	Healthy      types.Bool   `tfsdk:"healthy"`
	APIKeyLabels types.List   `tfsdk:"api_key_labels"`
}

func NewInstanceResource() resource.Resource {
	return &instanceResource{}
}

func (r *instanceResource) Metadata(_ context.Context, req resource.MetadataRequest, resp *resource.MetadataResponse) {
	resp.TypeName = req.ProviderTypeName + "_instance"
}

func (r *instanceResource) Schema(_ context.Context, _ resource.SchemaRequest, resp *resource.SchemaResponse) {
	resp.Schema = schema.Schema{
		Description: "Bootstraps an n8n instance via n8nforge CLI.",
		Attributes: map[string]schema.Attribute{
			"id": schema.StringAttribute{
				Computed:    true,
				Description: "Instance URL identifier.",
				PlanModifiers: []planmodifier.String{
					stringplanmodifier.UseStateForUnknown(),
				},
			},
			"manifest_path": schema.StringAttribute{
				Required:    true,
				Description: "Path to n8nforge.yaml manifest file.",
			},
			"phase": schema.StringAttribute{
				Optional:    true,
				Description: "Bootstrap phase: all, pre-boot, post-boot.",
			},
			"instance_url": schema.StringAttribute{
				Computed:    true,
				Description: "n8n instance URL.",
			},
			"healthy": schema.BoolAttribute{
				Computed:    true,
				Description: "Whether n8n health check passed.",
			},
			"api_key_labels": schema.ListAttribute{
				Computed:    true,
				ElementType: types.StringType,
				Description: "Labels of bootstrapped API keys (not raw keys).",
			},
		},
	}
}

func (r *instanceResource) Configure(_ context.Context, req resource.ConfigureRequest, _ *resource.ConfigureResponse) {
	if req.ProviderData == nil {
		return
	}
	r.client = req.ProviderData.(*Client)
}

func (r *instanceResource) Create(ctx context.Context, req resource.CreateRequest, resp *resource.CreateResponse) {
	var plan instanceModel
	resp.Diagnostics.Append(req.Plan.Get(ctx, &plan)...)
	if resp.Diagnostics.HasError() {
		return
	}

	phase := "all"
	if !plan.Phase.IsNull() && !plan.Phase.IsUnknown() {
		phase = plan.Phase.ValueString()
	}

	_, err := r.client.Bootstrap(ctx, plan.ManifestPath.ValueString(), phase, "")
	if err != nil {
		resp.Diagnostics.AddError("Bootstrap failed", err.Error())
		return
	}

	status, err := r.client.Status(ctx, plan.ManifestPath.ValueString())
	if err != nil {
		resp.Diagnostics.AddError("Status check failed", err.Error())
		return
	}

	labels, diags := types.ListValueFrom(ctx, types.StringType, status.APIKeyLabels)
	resp.Diagnostics.Append(diags...)

	plan.ID = types.StringValue(status.InstanceURL)
	plan.InstanceURL = types.StringValue(status.InstanceURL)
	plan.Healthy = types.BoolValue(status.Healthy)
	plan.APIKeyLabels = labels

	resp.Diagnostics.Append(resp.State.Set(ctx, &plan)...)
}

func (r *instanceResource) Read(ctx context.Context, req resource.ReadRequest, resp *resource.ReadResponse) {
	var state instanceModel
	resp.Diagnostics.Append(req.State.Get(ctx, &state)...)
	if resp.Diagnostics.HasError() {
		return
	}

	status, err := r.client.Status(ctx, state.ManifestPath.ValueString())
	if err != nil {
		resp.Diagnostics.AddError("Status check failed", err.Error())
		return
	}

	labels, diags := types.ListValueFrom(ctx, types.StringType, status.APIKeyLabels)
	resp.Diagnostics.Append(diags...)

	state.InstanceURL = types.StringValue(status.InstanceURL)
	state.Healthy = types.BoolValue(status.Healthy)
	state.APIKeyLabels = labels

	resp.Diagnostics.Append(resp.State.Set(ctx, &state)...)
}

func (r *instanceResource) Update(ctx context.Context, req resource.UpdateRequest, resp *resource.UpdateResponse) {
	var createResp resource.CreateResponse
	r.Create(ctx, resource.CreateRequest{Plan: req.Plan}, &createResp)
	resp.Diagnostics = createResp.Diagnostics
	resp.State = createResp.State
}

func (r *instanceResource) Delete(_ context.Context, _ resource.DeleteRequest, _ *resource.DeleteResponse) {
	// Bootstrap is not destructive on delete — n8n instance remains.
}
