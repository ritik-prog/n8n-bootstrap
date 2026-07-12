package provider

import (
	"context"

	"github.com/hashicorp/terraform-plugin-framework/resource"
	"github.com/hashicorp/terraform-plugin-framework/resource/schema"
	"github.com/hashicorp/terraform-plugin-framework/types"
)

var _ resource.Resource = &ownerResource{}

type ownerResource struct {
	client *Client
}

type ownerModel struct {
	ID           types.String `tfsdk:"id"`
	ManifestPath types.String `tfsdk:"manifest_path"`
	Email        types.String `tfsdk:"email"`
}

func NewOwnerResource() resource.Resource {
	return &ownerResource{}
}

func (r *ownerResource) Metadata(_ context.Context, req resource.MetadataRequest, resp *resource.MetadataResponse) {
	resp.TypeName = req.ProviderTypeName + "_owner"
}

func (r *ownerResource) Schema(_ context.Context, _ resource.SchemaRequest, resp *resource.SchemaResponse) {
	resp.Schema = schema.Schema{
		Description: "Manages n8n instance owner via pre-boot env bootstrap.",
		Attributes: map[string]schema.Attribute{
			"id": schema.StringAttribute{
				Computed:    true,
				Description: "Owner email.",
			},
			"manifest_path": schema.StringAttribute{
				Required:    true,
				Description: "Path to n8nforge.yaml manifest.",
			},
			"email": schema.StringAttribute{
				Computed:    true,
				Description: "Owner email from manifest.",
			},
		},
	}
}

func (r *ownerResource) Configure(_ context.Context, req resource.ConfigureRequest, _ *resource.ConfigureResponse) {
	if req.ProviderData == nil {
		return
	}
	r.client = req.ProviderData.(*Client)
}

func (r *ownerResource) Create(ctx context.Context, req resource.CreateRequest, resp *resource.CreateResponse) {
	var plan ownerModel
	resp.Diagnostics.Append(req.Plan.Get(ctx, &plan)...)
	if resp.Diagnostics.HasError() {
		return
	}

	_, err := r.client.Bootstrap(ctx, plan.ManifestPath.ValueString(), "pre-boot", "")
	if err != nil {
		resp.Diagnostics.AddError("Owner bootstrap failed", err.Error())
		return
	}

	status, err := r.client.Status(ctx, plan.ManifestPath.ValueString())
	if err != nil {
		resp.Diagnostics.AddError("Status check failed", err.Error())
		return
	}

	plan.ID = types.StringValue(status.InstanceURL)
	plan.Email = types.StringValue("configured-via-manifest")
	resp.Diagnostics.Append(resp.State.Set(ctx, &plan)...)
}

func (r *ownerResource) Read(ctx context.Context, req resource.ReadRequest, resp *resource.ReadResponse) {
	var state ownerModel
	resp.Diagnostics.Append(req.State.Get(ctx, &state)...)
	resp.Diagnostics.Append(resp.State.Set(ctx, &state)...)
}

func (r *ownerResource) Update(ctx context.Context, req resource.UpdateRequest, resp *resource.UpdateResponse) {
	var createResp resource.CreateResponse
	r.Create(ctx, resource.CreateRequest{Plan: req.Plan}, &createResp)
	resp.Diagnostics = createResp.Diagnostics
	resp.State = createResp.State
}

func (r *ownerResource) Delete(_ context.Context, _ resource.DeleteRequest, _ *resource.DeleteResponse) {}
