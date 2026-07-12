package provider

import (
	"context"

	"github.com/hashicorp/terraform-plugin-framework/datasource"
	"github.com/hashicorp/terraform-plugin-framework/datasource/schema"
	"github.com/hashicorp/terraform-plugin-framework/types"
)

var _ datasource.DataSource = &instanceDataSource{}

type instanceDataSource struct {
	client *Client
}

type instanceDataSourceModel struct {
	ManifestPath types.String `tfsdk:"manifest_path"`
	InstanceURL  types.String `tfsdk:"instance_url"`
	Healthy      types.Bool   `tfsdk:"healthy"`
	Phase        types.String `tfsdk:"phase"`
	APIKeyLabels types.List   `tfsdk:"api_key_labels"`
}

func NewInstanceDataSource() datasource.DataSource {
	return &instanceDataSource{}
}

func (d *instanceDataSource) Metadata(_ context.Context, req datasource.MetadataRequest, resp *datasource.MetadataResponse) {
	resp.TypeName = req.ProviderTypeName + "_instance"
}

func (d *instanceDataSource) Schema(_ context.Context, _ datasource.SchemaRequest, resp *datasource.SchemaResponse) {
	resp.Schema = schema.Schema{
		Description: "Read n8n instance bootstrap status.",
		Attributes: map[string]schema.Attribute{
			"manifest_path": schema.StringAttribute{
				Required: true,
			},
			"instance_url": schema.StringAttribute{
				Computed: true,
			},
			"healthy": schema.BoolAttribute{
				Computed: true,
			},
			"phase": schema.StringAttribute{
				Computed: true,
			},
			"api_key_labels": schema.ListAttribute{
				Computed:    true,
				ElementType: types.StringType,
			},
		},
	}
}

func (d *instanceDataSource) Configure(_ context.Context, req datasource.ConfigureRequest, _ *datasource.ConfigureResponse) {
	if req.ProviderData == nil {
		return
	}
	d.client = req.ProviderData.(*Client)
}

func (d *instanceDataSource) Read(ctx context.Context, req datasource.ReadRequest, resp *datasource.ReadResponse) {
	var config instanceDataSourceModel
	resp.Diagnostics.Append(req.Config.Get(ctx, &config)...)
	if resp.Diagnostics.HasError() {
		return
	}

	status, err := d.client.Status(ctx, config.ManifestPath.ValueString())
	if err != nil {
		resp.Diagnostics.AddError("Status check failed", err.Error())
		return
	}

	labels, diags := types.ListValueFrom(ctx, types.StringType, status.APIKeyLabels)
	resp.Diagnostics.Append(diags...)

	config.InstanceURL = types.StringValue(status.InstanceURL)
	config.Healthy = types.BoolValue(status.Healthy)
	config.Phase = types.StringValue(status.Phase)
	config.APIKeyLabels = labels

	resp.Diagnostics.Append(resp.State.Set(ctx, &config)...)
}
