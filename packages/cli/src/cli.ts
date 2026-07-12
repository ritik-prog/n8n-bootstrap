#!/usr/bin/env node
import { Command } from 'commander';
import { writeFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import {
  loadManifest,
  saveManifest,
  DEFAULT_MANIFEST,
  createPlan,
  runBootstrap,
  runDoctor,
  getStatus,
  redactBootstrapResult,
  generateEncryptionKey,
  getStatePaths,
  loadPersistedSecrets,
} from '@n8nforge/core';

const program = new Command();

function runAction(fn: () => void | Promise<void>): void {
  Promise.resolve(fn()).catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Error: ${message}`);
    process.exit(1);
  });
}

program
  .name('n8nforge')
  .description('Production n8n bootstrap and provisioning CLI')
  .version('0.1.0');

program
  .command('init')
  .description('Scaffold n8nforge.yaml and .env.example')
  .option('-d, --dir <dir>', 'Output directory', '.')
  .option('--json', 'Output as JSON')
  .action((opts: { dir: string; json?: boolean }) => {
    runAction(() => {
      const manifestPath = join(opts.dir, 'n8nforge.yaml');
      const envExamplePath = join(opts.dir, '.env.example');

      if (!existsSync(manifestPath)) {
        saveManifest(manifestPath, DEFAULT_MANIFEST);
      }

      const envExample = `# n8nforge environment variables
POSTGRES_PASSWORD=change-me-secure-password
N8N_OWNER_PASSWORD=change-me-owner-password

# Optional: override generated secrets
# N8N_ENCRYPTION_KEY=
# N8N_USER_MANAGEMENT_JWT_SECRET=
`;
      writeFileSync(envExamplePath, envExample, 'utf8');

      const result = {
        manifest: manifestPath,
        envExample: envExamplePath,
        message: 'Initialized n8nforge project files',
      };

      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(`Created ${manifestPath}`);
        console.log(`Created ${envExamplePath}`);
        console.log('\nNext steps:');
        console.log('  1. Edit n8nforge.yaml');
        console.log('  2. cp .env.example .env && edit secrets');
        console.log('  3. n8nforge plan');
        console.log('  4. n8nforge bootstrap');
      }
    });
  });

program
  .command('plan')
  .description('Dry-run bootstrap plan (secrets masked)')
  .option('-f, --file <file>', 'Manifest file', 'n8nforge.yaml')
  .option('--state-dir <dir>', 'State directory', '.n8nforge')
  .option('--json', 'Output as JSON')
  .action((opts: { file: string; stateDir: string; json?: boolean }) => {
    runAction(async () => {
      const manifest = loadManifest(opts.file);
      const plan = await createPlan(manifest, opts.stateDir);

      if (opts.json) {
        console.log(JSON.stringify(plan, null, 2));
      } else {
        console.log(`Instance: ${plan.instanceUrl}`);
        console.log(`Provider: ${plan.provider}`);
        console.log(`n8n version: ${plan.n8nVersion}`);
        if (plan.currentPhase) {
          console.log(`Current phase: ${plan.currentPhase}`);
        }
        if (plan.warnings.length) {
          console.log('\nWarnings:');
          plan.warnings.forEach((w) => console.log(`  ⚠ ${w}`));
        }
        console.log('\nPlanned actions:');
        plan.actions.forEach((a) => {
          const details = a.details
            ? ` (${Object.entries(a.details).map(([k, v]) => `${k}=${v}`).join(', ')})`
            : '';
          console.log(`  [${a.phase}] ${a.action}${details}`);
        });
      }
    });
  });

program
  .command('bootstrap')
  .description('Run bootstrap pipeline')
  .option('-f, --file <file>', 'Manifest file', 'n8nforge.yaml')
  .option('--phase <phase>', 'Phase: all, pre-boot, post-boot', 'all')
  .option('--state-dir <dir>', 'State directory', '.n8nforge')
  .option('--timeout <ms>', 'Post-boot timeout in ms', '120000')
  .option('--api-key-label <label>', 'Create only this API key label (post-boot)')
  .option('--json', 'Output as JSON')
  .action(
    (opts: {
      file: string;
      phase: string;
      stateDir: string;
      timeout: string;
      apiKeyLabel?: string;
      json?: boolean;
    }) => {
      runAction(async () => {
        const manifest = loadManifest(opts.file);
        const phase = opts.phase as 'all' | 'pre-boot' | 'post-boot';

        const result = await runBootstrap(manifest, {
          stateDir: opts.stateDir,
          phase,
          timeoutMs: parseInt(opts.timeout, 10),
          apiKeyLabel: opts.apiKeyLabel,
        });

        if (opts.json) {
          console.log(JSON.stringify(redactBootstrapResult(result), null, 2));
        } else {
          if (result.preBoot) {
            if (result.preBoot.skipped) {
              console.log('Pre-boot skipped (state current, env unchanged)');
            } else {
              console.log('Pre-boot complete:');
              console.log(`  Env file: ${result.preBoot.envFile}`);
              console.log(`  Instance: ${result.preBoot.instanceUrl}`);
              if (result.preBoot.generatedPassword) {
                console.log(
                  `  Owner password was auto-generated (see ${result.preBoot.secretsFile})`,
                );
              }
            }
          }
          if (result.postBoot) {
            console.log('Post-boot complete:');
            console.log(`  Instance: ${result.postBoot.instanceUrl}`);
            for (const key of result.postBoot.apiKeys) {
              if (key.skipped) {
                console.log(`  API key "${key.label}": skipped (exists)`);
              } else {
                console.log(`  API key "${key.label}": created`);
              }
            }
          }
        }
      });
    },
  );

program
  .command('status')
  .description('Check bootstrap and instance status')
  .option('-f, --file <file>', 'Manifest file', 'n8nforge.yaml')
  .option('--state-dir <dir>', 'State directory', '.n8nforge')
  .option('--json', 'Output as JSON')
  .action((opts: { file: string; stateDir: string; json?: boolean }) => {
    runAction(async () => {
      const manifest = loadManifest(opts.file);
      const status = await getStatus(manifest, opts.stateDir);

      if (opts.json) {
        console.log(JSON.stringify(status, null, 2));
      } else {
        console.log(`Instance: ${status.instanceUrl}`);
        console.log(`Phase: ${status.phase ?? 'not bootstrapped'}`);
        console.log(`Healthy: ${status.healthy ? 'yes' : 'no'}`);
        console.log(`API keys: ${status.apiKeyLabels.join(', ') || 'none'}`);
      }
    });
  });

program
  .command('doctor')
  .description('Validate configuration and environment')
  .option('-f, --file <file>', 'Manifest file', 'n8nforge.yaml')
  .option('--port <port>', 'Port to check', undefined)
  .option('--state-dir <dir>', 'State directory', '.n8nforge')
  .option('--skip-health', 'Skip health check')
  .option('--json', 'Output as JSON')
  .action(
    (opts: {
      file: string;
      port?: string;
      stateDir: string;
      skipHealth?: boolean;
      json?: boolean;
    }) => {
      runAction(async () => {
        const manifest = loadManifest(opts.file);
        const result = await runDoctor(manifest, {
          port: opts.port ? parseInt(opts.port, 10) : undefined,
          stateDir: opts.stateDir,
          skipHealth: opts.skipHealth,
        });

        if (opts.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(result.healthy ? 'All checks passed' : 'Some checks failed');
          for (const check of result.checks) {
            const icon = check.status === 'pass' ? '✓' : check.status === 'warn' ? '⚠' : '✗';
            console.log(`  ${icon} [${check.name}] ${check.message}`);
          }
        }

        if (!result.healthy) {
          process.exit(1);
        }
      });
    },
  );

program
  .command('rotate-key')
  .description('Rotate encryption key (generates new key — update env and restart n8n)')
  .option('-f, --file <file>', 'Manifest file', 'n8nforge.yaml')
  .option('--state-dir <dir>', 'State directory', '.n8nforge')
  .option('--type <type>', 'Key type: encryption', 'encryption')
  .option('--json', 'Output as JSON')
  .action(
    (opts: { file: string; stateDir: string; type: string; json?: boolean }) => {
      runAction(async () => {
        if (opts.type !== 'encryption') {
          throw new Error(`Unsupported key type "${opts.type}". Supported: encryption`);
        }

        loadManifest(opts.file);
        const paths = getStatePaths(opts.stateDir);
        const persisted = loadPersistedSecrets(paths);
        if (!persisted) {
          throw new Error('No secrets.json found — run bootstrap --phase pre-boot first');
        }

        const newKey = generateEncryptionKey();
        const updated = { ...persisted, encryptionKey: newKey };
        writeFileSync(paths.secretsFile, JSON.stringify(updated, null, 2), { mode: 0o600 });

        // Manifest hash is unchanged, so the pre-boot idempotency check would
        // otherwise skip regenerating generated.env and leave the old key in place.
        if (existsSync(paths.envFile)) {
          rmSync(paths.envFile);
        }

        const result = {
          type: 'encryption',
          message:
            'New encryption key generated in secrets.json. Re-run bootstrap --phase pre-boot to update generated.env, then restart n8n with N8N_ENV_FEAT_ENCRYPTION_KEY_ROTATION=true after backing up the database.',
          secretsFile: paths.secretsFile,
          encryptionKeyPreview: `${newKey.slice(0, 4)}...${newKey.slice(-4)}`,
        };

        if (opts.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(result.message);
          console.log(`Updated: ${paths.secretsFile}`);
        }
      });
    },
  );

program.parse();
