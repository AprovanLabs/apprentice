// Providers command - manage AI provider connections

import { Command } from 'commander';
import {
  connect,
  disconnect,
  getStatus,
  isConfigured,
  CopilotClient,
} from '@apprentice/copilot-proxy';

/**
 * Register the providers command with subcommands
 */
export function registerProvidersCommand(program: Command): void {
  const providers = program
    .command('providers')
    .alias('provider')
    .description('Manage AI provider connections');

  // Connect subcommand
  providers
    .command('connect <provider>')
    .description('Connect to an AI provider')
    .action(async (provider: string) => {
      if (provider !== 'copilot') {
        console.error(`Unknown provider: ${provider}`);
        console.log('Available providers: copilot');
        process.exit(1);
      }

      if (await isConfigured()) {
        console.log(
          "Already connected. Use 'apr providers disconnect copilot' first.",
        );
        return;
      }

      console.log('Starting GitHub Copilot authentication...\n');

      try {
        const { userCode, verificationUrl, waitForAuth } = await connect();

        console.log(`Open: ${verificationUrl}`);
        console.log(`Code: ${userCode}\n`);
        console.log('Waiting for authorization...');

        await waitForAuth();

        console.log('\n✓ Connected to GitHub Copilot');
      } catch (error) {
        console.error(
          '\n✗ Failed:',
          error instanceof Error ? error.message : error,
        );
        process.exit(1);
      }
    });

  // Disconnect subcommand
  providers
    .command('disconnect <provider>')
    .description('Disconnect from an AI provider')
    .action(async (provider: string) => {
      if (provider !== 'copilot') {
        console.error(`Unknown provider: ${provider}`);
        process.exit(1);
      }

      await disconnect();
      console.log('✓ Disconnected from GitHub Copilot');
    });

  // Status subcommand
  providers
    .command('status')
    .description('Show connection status for all providers')
    .action(async () => {
      const status = await getStatus();

      console.log('GitHub Copilot:');
      if (status.connected) {
        const storageInfo =
          status.storage === 'keychain' ? ' [keychain]' : ' [file]';
        console.log(
          `  ✓ Connected${storageInfo} (since ${status.createdAt?.toLocaleDateString()})`,
        );
      } else {
        console.log('  ✗ Not connected');
        console.log("  Run 'apr providers connect copilot' to connect");
      }
    });

  // Models subcommand
  providers
    .command('models')
    .description('List available models from connected providers')
    .option('-p, --provider <provider>', 'Filter by provider', 'copilot')
    .action(async (options) => {
      if (options.provider !== 'copilot') {
        console.error(`Unknown provider: ${options.provider}`);
        process.exit(1);
      }

      if (!(await isConfigured())) {
        console.log(
          "Not connected. Run 'apr providers connect copilot' first.",
        );
        process.exit(1);
      }

      try {
        const client = new CopilotClient();
        const models = await client.listModels();
        console.log('Available models:\n');
        for (const model of models) {
          console.log(`  ${model.id}`);
        }
      } catch (error) {
        console.error(
          'Failed to list models:',
          error instanceof Error ? error.message : error,
        );
        process.exit(1);
      }
    });
}
