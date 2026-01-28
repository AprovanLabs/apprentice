#!/usr/bin/env node
/**
 * GitHub Copilot Proxy - CLI
 *
 * Command-line interface for running the proxy server and managing authentication.
 */

import { Command } from 'commander';
import { connect, disconnect, getStatus, isConfigured } from './auth.js';
import { CopilotClient } from './client.js';
import { createProxyServer } from './server/http.js';

const program = new Command();

program
  .name('copilot-proxy')
  .description('GitHub Copilot OpenAI-compatible proxy server')
  .version('0.1.0');

// Connect command
program
  .command('connect')
  .description('Authenticate with GitHub Copilot using device flow')
  .action(async () => {
    try {
      console.log('Starting GitHub Copilot authentication...\n');

      const { userCode, verificationUrl, waitForAuth } = await connect();

      console.log('To authorize, visit:');
      console.log(`  ${verificationUrl}\n`);
      console.log('And enter this code:');
      console.log(`  ${userCode}\n`);
      console.log('Waiting for authorization...');

      await waitForAuth();

      console.log('\n✓ Successfully connected to GitHub Copilot!');
      console.log('You can now run: copilot-proxy serve');
    } catch (error) {
      console.error(
        'Error:',
        error instanceof Error ? error.message : 'Unknown error',
      );
      process.exit(1);
    }
  });

// Disconnect command
program
  .command('disconnect')
  .description('Remove stored GitHub Copilot credentials')
  .action(async () => {
    try {
      await disconnect();
      console.log('✓ Disconnected from GitHub Copilot');
    } catch (error) {
      console.error(
        'Error:',
        error instanceof Error ? error.message : 'Unknown error',
      );
      process.exit(1);
    }
  });

// Status command
program
  .command('status')
  .description('Check connection status')
  .action(async () => {
    try {
      const status = await getStatus();

      if (status.connected) {
        console.log('✓ Connected to GitHub Copilot');
        if (status.createdAt) {
          console.log(
            `  Connected since: ${status.createdAt.toLocaleString()}`,
          );
        }
        if (status.storage) {
          console.log(`  Token storage: ${status.storage}`);
        }
      } else {
        console.log('✗ Not connected');
        console.log('  Run: copilot-proxy connect');
      }
    } catch (error) {
      console.error(
        'Error:',
        error instanceof Error ? error.message : 'Unknown error',
      );
      process.exit(1);
    }
  });

// Models command
program
  .command('models')
  .description('List available models')
  .action(async () => {
    try {
      if (!(await isConfigured())) {
        console.error('Not connected. Run: copilot-proxy connect');
        process.exit(1);
      }

      const client = new CopilotClient();
      const models = await client.listModels();

      console.log('Available models:\n');
      for (const model of models) {
        console.log(`  - ${model.id}`);
      }
    } catch (error) {
      console.error(
        'Error:',
        error instanceof Error ? error.message : 'Unknown error',
      );
      process.exit(1);
    }
  });

// Serve command
program
  .command('serve')
  .description('Start the OpenAI-compatible proxy server')
  .option('-p, --port <port>', 'Port to listen on', '8080')
  .option('-h, --host <host>', 'Host to bind to', '127.0.0.1')
  .option('-v, --verbose', 'Enable verbose logging', false)
  .action(async (options) => {
    try {
      const port = parseInt(options.port, 10);
      const host = options.host;
      const verbose = options.verbose;

      if (!(await isConfigured())) {
        console.error('Not connected to GitHub Copilot.');
        console.error('Run: copilot-proxy connect');
        process.exit(1);
      }

      console.log('Starting Copilot proxy server...\n');

      const proxy = createProxyServer({ port, host, verbose });
      const addr = await proxy.start();

      console.log(`✓ Server running at http://${addr.host}:${addr.port}`);
      console.log('\nEndpoints:');
      console.log(`  GET  /v1/models         - List available models`);
      console.log(`  POST /v1/chat/completions - Create chat completion`);
      console.log(`  GET  /health            - Health check`);
      console.log('\nUsage with OpenAI SDK:');
      console.log(`  OPENAI_API_BASE=http://${addr.host}:${addr.port}/v1`);
      console.log(
        `  OPENAI_API_KEY=anything  # Not validated, but required by SDK`,
      );
      console.log('\nPress Ctrl+C to stop\n');

      // Handle shutdown
      process.on('SIGINT', async () => {
        console.log('\nShutting down...');
        await proxy.stop();
        process.exit(0);
      });

      process.on('SIGTERM', async () => {
        await proxy.stop();
        process.exit(0);
      });
    } catch (error) {
      console.error(
        'Error:',
        error instanceof Error ? error.message : 'Unknown error',
      );
      process.exit(1);
    }
  });

program.action(() => program.help());
program.parse();
