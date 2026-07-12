package provider

import (
	"context"

	"github.com/hashicorp/terraform-plugin-framework/datasource"
	"github.com/hashicorp/terraform-plugin-framework/datasource/schema"
	"github.com/hashicorp/terraform-plugin-framework/types"
)

var _ datasource.DataSource = &versionDataSource{}

type versionDataSource struct{}

type versionDataSourceModel struct {
	MinN8nVersion types.String `tfsdk:"min_n8n_version"`
	ProviderVersion types.String `tfsdk:"provider_version"`
}

func NewVersionDataSource() datasource.DataSource {
	return &versionDataSource{}
}

func (d *versionDataSource) Metadata(_ context.Context, req datasource.MetadataRequest, resp *datasource.MetadataResponse) {
	resp.TypeName = req.ProviderTypeName + "_version"
}

func (d *versionDataSource) Schema(_ context.Context, _ datasource.SchemaRequest, resp *datasource.SchemaResponse) {
	resp.Schema = schema.Schema{
		Description: "Returns compatible n8n version constraints.",
		Attributes: map[string]schema.Attribute{
			"min_n8n_version": schema.StringAttribute{
				Computed: true,
			},
			"provider_version": schema.StringAttribute{
				Computed: true,
			},
		},
	}
}

func (d *versionDataSource) Read(ctx context.Context, req datasource.ReadRequest, resp *datasource.ReadResponse) {
	var state versionDataSourceModel
	state.MinN8nVersion = types.StringValue("2.17.0")
	state.ProviderVersion = types.StringValue("0.1.0")
	resp.Diagnostics.Append(resp.State.Set(ctx, &state)...)
}
