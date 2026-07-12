package provider

import (
	"testing"
)

func TestBootstrapArgsIncludeApiKeyLabel(t *testing.T) {
	args := []string{"bootstrap", "-f", "manifest.yaml", "--phase", "post-boot", "--json"}
	label := "ci-deploy"
	if label != "" {
		args = append(args, "--api-key-label", label)
	}
	if len(args) != 7 {
		t.Fatalf("expected 7 args, got %d: %v", len(args), args)
	}
	if args[6] != "ci-deploy" {
		t.Fatalf("expected api key label arg, got %v", args)
	}
}

func TestAccProviderVersionDataSource(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping acceptance test in short mode")
	}
	t.Skip("Set TF_ACC=1 and install n8nforge CLI for full acceptance tests")
}
