package provider

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"os/exec"
)

type Client struct {
	CLIPath string
}

type BootstrapResult struct {
	PreBoot *struct {
		EnvFile     string `json:"envFile"`
		SecretsFile string `json:"secretsFile"`
		InstanceURL string `json:"instanceUrl"`
	} `json:"preBoot"`
	PostBoot *struct {
		InstanceURL string `json:"instanceUrl"`
		APIKeys     []struct {
			Label     string `json:"label"`
			ID        string `json:"id"`
			RawAPIKey string `json:"rawApiKey"`
			Skipped   bool   `json:"skipped"`
		} `json:"apiKeys"`
	} `json:"postBoot"`
}

type StatusResult struct {
	Phase        string   `json:"phase"`
	InstanceURL  string   `json:"instanceUrl"`
	ManifestHash string   `json:"manifestHash"`
	APIKeyLabels []string `json:"apiKeyLabels"`
	Healthy      bool     `json:"healthy"`
}

func (c *Client) Bootstrap(ctx context.Context, manifestPath, phase, apiKeyLabel string) (*BootstrapResult, error) {
	args := []string{"bootstrap", "-f", manifestPath, "--phase", phase, "--json"}
	if apiKeyLabel != "" {
		args = append(args, "--api-key-label", apiKeyLabel)
	}
	out, err := c.run(ctx, args...)
	if err != nil {
		return nil, err
	}
	var result BootstrapResult
	if err := json.Unmarshal(out, &result); err != nil {
		return nil, fmt.Errorf("parse bootstrap output: %w", err)
	}
	return &result, nil
}

func (c *Client) Status(ctx context.Context, manifestPath string) (*StatusResult, error) {
	args := []string{"status", "-f", manifestPath, "--json"}
	out, err := c.run(ctx, args...)
	if err != nil {
		return nil, err
	}
	var result StatusResult
	if err := json.Unmarshal(out, &result); err != nil {
		return nil, fmt.Errorf("parse status output: %w", err)
	}
	return &result, nil
}

func (c *Client) run(ctx context.Context, args ...string) ([]byte, error) {
	cmd := exec.CommandContext(ctx, c.CLIPath, args...)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return nil, fmt.Errorf("n8nforge %v: %w\nstderr: %s", args, err, stderr.String())
	}
	return stdout.Bytes(), nil
}
