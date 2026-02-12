// Apprentice CLI

import { program } from 'commander';
import { searchCommand } from './commands/search';
import { completionsCommand } from './commands/completions';
import { registerImportCommand } from './commands/import';
import { registerProvidersCommand } from './commands/providers';
import { indexCommand } from './commands/index';
import { daemonCommand } from './commands/daemon';
import { registerContextCommand } from './commands/context';
import { runCommand } from './commands/run';

program
  .name('apr')
  .description('Apprentice - Personal knowledge assistant')
  .version('0.1.0');

// === SEARCH ===

// Helper to collect repeatable options
function collect(value: string, previous: string[]): string[] {
  return [...previous, value];
}

program
  .command('search <query>')
  .description('Search unified knowledge base (events and assets)')
  .option('-n, --limit <number>', 'Maximum results', '20')
  .option('--mode <mode>', 'Search mode: fts, vector, hybrid', 'hybrid')
  .option('--scope <scope>', 'Search scope: events, assets, all', 'all')
  .option(
    '--since <time>',
    "Filter to items since time (e.g., '1h', '30m', '2d')",
  )
  .option(
    '-f, --filter <key=value>',
    'Filter by metadata (repeatable)',
    collect,
    [],
  )
  .option('--related', 'Include related context for event results')
  .option('--group-by <field>', 'Group related events by metadata field')
  .option(
    '--order-by <field>',
    'Order related events by field (default: timestamp)',
  )
  .option('--direction <direction>', 'Sort direction: asc, desc', 'asc')
  .option('--window <seconds>', 'Temporal window in seconds for fallback', '60')
  .option('--related-limit <number>', 'Max related events per result', '20')
  .option('--json', 'Output as JSON')
  .option('--md', 'Output as Markdown')
  .action(async (query, options) => {
    const format = options.json ? 'json' : options.md ? 'md' : 'text';
    const limit = parseInt(options.limit, 10);
    const window = options.window ? parseInt(options.window, 10) : undefined;
    const relatedLimit = options.relatedLimit
      ? parseInt(options.relatedLimit, 10)
      : undefined;

    // Validate numeric options
    if (isNaN(limit) || limit <= 0) {
      console.error(
        `Error: Invalid limit value "${options.limit}". Use -n <number> or --limit <number>`,
      );
      process.exit(1);
    }
    if (window !== undefined && (isNaN(window) || window <= 0)) {
      console.error(
        `Error: Invalid window value "${options.window}". Must be a positive number.`,
      );
      process.exit(1);
    }
    if (
      relatedLimit !== undefined &&
      (isNaN(relatedLimit) || relatedLimit <= 0)
    ) {
      console.error(
        `Error: Invalid related-limit value "${options.relatedLimit}". Must be a positive number.`,
      );
      process.exit(1);
    }

    await searchCommand(query, {
      limit,
      since: options.since,
      filter: options.filter,
      format,
      mode: options.mode,
      scope: options.scope,
      related: options.related,
      groupBy: options.groupBy,
      orderBy: options.orderBy,
      direction: options.direction,
      window,
      relatedLimit,
    });
  });

// === INDEXER ===

program
  .command('index')
  .description('Index contexts, events, and generate embeddings')
  .option('-c, --context <id>', 'Index specific context')
  .option('-a, --all', 'Index all contexts (including disabled)')
  .option('--versions-only', 'Only sync versions, skip file indexing')
  .option('--no-versions', 'Skip version syncing')
  .option('--version-depth <number>', 'Max commits to sync')
  .action(async (options) => {
    await indexCommand({
      context: options.context,
      all: options.all,
      versionsOnly: options.versionsOnly,
      noVersions: !options.versions,
      versionDepth: options.versionDepth
        ? parseInt(options.versionDepth, 10)
        : undefined,
    });
  });

// === COMPLETIONS ===

program
  .command('completions')
  .description('Generate completions for shell (internal use)')
  .option(
    '-t, --type <type>',
    'Completion type: scripts, script-args, git-suggest',
    'scripts',
  )
  .option('-s, --script <name>', 'Script name (for script-args)')
  .option('-p, --prefix <prefix>', 'Filter by prefix')
  .option('--cwd <path>', 'Working directory')
  .option('--branch <name>', 'Git branch')
  .action((options) =>
    completionsCommand({
      type: options.type,
      script: options.script,
      prefix: options.prefix,
      cwd: options.cwd,
      branch: options.branch,
    }),
  );

// === IMPORT ===

registerImportCommand(program);

// === PROVIDERS ===

registerProvidersCommand(program);

// === CONTEXT ===

registerContextCommand(program);

// === RUN ===

program
  .command('run <asset-id-or-path> [args...]')
  .description('Execute an asset (script) with arguments')
  .action(async (idOrPath, args) => {
    await runCommand(idOrPath, args);
  });

// === DAEMON ===

program
  .command('daemon')
  .description('Start the chat interface daemon')
  .action(() => daemonCommand());

// === INDEXER DAEMON ===

import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

const indexerCommand = program
  .command('indexer')
  .description('Manage the background indexer daemon');

indexerCommand
  .command('start')
  .description('Start the indexer daemon (if not already running)')
  .option('-q, --quiet', 'Suppress output when already running')
  .action(async (options) => {
    const homeDir =
      process.env.APPRENTICE_HOME || join(process.env.HOME!, '.apprentice');
    const pidFile = join(homeDir, 'indexer.pid');
    const logFile = join(homeDir, 'indexer.log');

    // Check if already running
    if (existsSync(pidFile)) {
      try {
        const pid = parseInt(readFileSync(pidFile, 'utf-8').trim(), 10);
        if (pid && process.kill(pid, 0)) {
          if (!options.quiet) {
            console.log(`Indexer already running (pid: ${pid})`);
          }
          return;
        }
      } catch {
        // Process not running, continue to start
      }
    }

    // Spawn detached process
    const child = spawn(
      process.execPath,
      [join(__dirname, 'indexer-daemon.js')],
      {
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env },
      },
    );

    // Write logs
    const fs = await import('node:fs');
    const logStream = fs.createWriteStream(logFile, { flags: 'a' });
    child.stdout?.pipe(logStream);
    child.stderr?.pipe(logStream);

    // Save PID and detach
    writeFileSync(pidFile, String(child.pid));
    child.unref();

    console.log(`🔄 Apprentice indexer started (pid: ${child.pid})`);
  });

indexerCommand
  .command('stop')
  .description('Stop the indexer daemon')
  .action(() => {
    const homeDir =
      process.env.APPRENTICE_HOME || join(process.env.HOME!, '.apprentice');
    const pidFile = join(homeDir, 'indexer.pid');

    if (!existsSync(pidFile)) {
      console.log('Indexer not running');
      return;
    }

    try {
      const pid = parseInt(readFileSync(pidFile, 'utf-8').trim(), 10);
      process.kill(pid, 'SIGTERM');
      unlinkSync(pidFile);
      console.log(`Indexer stopped (pid: ${pid})`);
    } catch (err: any) {
      if (err.code === 'ESRCH') {
        unlinkSync(pidFile);
        console.log('Indexer was not running (cleaned up stale pid file)');
      } else {
        console.error('Failed to stop indexer:', err.message);
      }
    }
  });

indexerCommand
  .command('status')
  .description('Check indexer daemon status')
  .action(() => {
    const homeDir =
      process.env.APPRENTICE_HOME || join(process.env.HOME!, '.apprentice');
    const pidFile = join(homeDir, 'indexer.pid');

    if (!existsSync(pidFile)) {
      console.log('Indexer: not running');
      return;
    }

    try {
      const pid = parseInt(readFileSync(pidFile, 'utf-8').trim(), 10);
      process.kill(pid, 0); // Check if process exists
      console.log(`Indexer: running (pid: ${pid})`);
    } catch {
      console.log('Indexer: not running (stale pid file)');
    }
  });

indexerCommand
  .command('run', { hidden: true })
  .description('Run indexer in foreground (internal)')
  .action(async () => {
    const { main } = await import('./indexer-daemon');
    await main();
  });

// === PATCHWORK ===

// TODO: createPatchworkCommand is not yet implemented
// program.addCommand(createPatchworkCommand());

program.parse();
