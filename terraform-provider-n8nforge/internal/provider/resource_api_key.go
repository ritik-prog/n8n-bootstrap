package provider

import (
	"context"

	"github.com/hashicorp/terraform-plugin-framework/resource"
	"github.com/hashicorp/terraform-plugin-framework/resource/schema"
	"github.com/hashicorp/terraform-plugin-framework/types"
)

var _ resource.Resource = &apiKeyResource{}

type apiKeyResource struct {
	client *Client
}

type apiKeyModel struct {
	ID           types.String `tfsdk:"id"`
	ManifestPath types.String `tfsdk:"manifest_path"`
	Label        types.String `tfsdk:"label"`
}

func NewAPIKeyResource() resource.Resource {
	return &apiKeyResource{}
}

func (r *apiKeyResource) Metadata(_ context.Context, req resource.MetadataRequest, resp *resource.MetadataResponse) {
	resp.TypeName = req.ProviderTypeName + "_api_key"
}

func (r *apiKeyResource) Schema(_ context.Context, _ resource.SchemaRequest, resp *resource.SchemaResponse) {
	resp.Schema = schema.Schema{
		Description: "Creates an API key on an existing n8n instance via post-boot bootstrap.",
		Attributes: map[string]schema.Attribute{
			"id": schema.StringAttribute{
				Computed:    true,
				Description: "API key label (raw key is never stored in TF state).",
			},
			"manifest_path": schema.StringAttribute{
				Required:    true,
				Description: "Path to n8nforge.yaml with apiKeys configuration.",
			},
			"label": schema.StringAttribute{
				Required:    true,
				Description: "API key label to bootstrap.",
			},
		},
	}
}

func (r *apiKeyResource) Configure(_ context.Context, req resource.ConfigureRequest, _ *resource.ConfigureResponse) {
	if req.ProviderData == nil {
		return
	}
	r.client = req.ProviderData.(*Client)
}

func (r *apiKeyResource) Create(ctx context.Context, req resource.CreateRequest, resp *resource.CreateResponse) {
	var plan apiKeyModel
	resp.Diagnostics.Append(req.Plan.Get(ctx, &plan)...)
	if resp.Diagnostics.HasError() {
		return
	}

	_, err := r.client.Bootstrap(ctx, plan.ManifestPath.ValueString(), "post-boot", plan.Label.ValueString())
	if err != nil {
		resp.Diagnostics.AddError("API key bootstrap failed", err.Error())
		return
	}

	plan.ID = plan.Label
	resp.Diagnostics.Append(resp.State.Set(ctx, &plan)...)
}

func (r *apiKeyResource) Read(ctx context.Context, req resource.ReadRequest, resp *resource.ReadResponse) {
	var state apiKeyModel
	resp.Diagnostics.Append(req.State.Get(ctx, &state)...)
	if resp.Diagnostics.HasError() {
		return
	}

	status, err := r.client.Status(ctx, state.ManifestPath.ValueString())
	if err != nil {
		resp.Diagnostics.AddError("Status check failed", err.Error())
		return
	}

	found := false
	for _, l := range status.APIKeyLabels {
		if l == state.Label.ValueString() {
			found = true
			break
		}
	}
	if !found {
		resp.State.RemoveResource(ctx)
		return
	}

	resp.Diagnostics.Append(resp.State.Set(ctx, &state)...)
}

func (r *apiKeyResource) Update(ctx context.Context, req resource.UpdateRequest, resp *resource.UpdateResponse) {
	var createResp resource.CreateResponse
	r.Create(ctx, resource.CreateRequest{Plan: req.Plan}, &createResp)
	resp.Diagnostics = createResp.Diagnostics
	resp.State = createResp.State
}

func (r *apiKeyResource) Delete(_ context.Context, _ resource.DeleteRequest, _ *resource.DeleteResponse) {}
