package provider

import (
	"context"

	"github.com/hashicorp/terraform-plugin-framework/datasource"
	"github.com/hashicorp/terraform-plugin-framework/provider"
	"github.com/hashicorp/terraform-plugin-framework/provider/schema"
	"github.com/hashicorp/terraform-plugin-framework/resource"
	"github.com/hashicorp/terraform-plugin-framework/types"
)

var _ provider.Provider = &n8nforgeProvider{}

type n8nforgeProvider struct {
	version string
}

func New(version string) func() provider.Provider {
	return func() provider.Provider {
		return &n8nforgeProvider{version: version}
	}
}

type providerModel struct {
	CLIPath types.String `tfsdk:"cli_path"`
}

func (p *n8nforgeProvider) Metadata(_ context.Context, _ provider.MetadataRequest, resp *provider.MetadataResponse) {
	resp.TypeName = "n8nforge"
	resp.Version = p.version
}

func (p *n8nforgeProvider) Schema(_ context.Context, _ provider.SchemaRequest, resp *provider.SchemaResponse) {
	resp.Schema = schema.Schema{
		Description: "Interact with n8nforge bootstrap CLI for n8n provisioning.",
		Attributes: map[string]schema.Attribute{
			"cli_path": schema.StringAttribute{
				Optional:    true,
				Description: "Path to n8nforge CLI binary. Defaults to n8nforge in PATH.",
			},
		},
	}
}

func (p *n8nforgeProvider) Configure(ctx context.Context, req provider.ConfigureRequest, resp *provider.ConfigureResponse) {
	var config providerModel
	resp.Diagnostics.Append(req.Config.Get(ctx, &config)...)
	if resp.Diagnostics.HasError() {
		return
	}

	cliPath := "n8nforge"
	if !config.CLIPath.IsNull() && !config.CLIPath.IsUnknown() {
		cliPath = config.CLIPath.ValueString()
	}

	client := &Client{CLIPath: cliPath}
	resp.DataSourceData = client
	resp.ResourceData = client
}

func (p *n8nforgeProvider) Resources(_ context.Context) []func() resource.Resource {
	return []func() resource.Resource{
		NewInstanceResource,
		NewAPIKeyResource,
		NewOwnerResource,
	}
}

func (p *n8nforgeProvider) DataSources(_ context.Context) []func() datasource.DataSource {
	return []func() datasource.DataSource{
		NewInstanceDataSource,
		NewVersionDataSource,
	}
}
