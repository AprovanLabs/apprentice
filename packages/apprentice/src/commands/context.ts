import chalk from 'chalk';
import { Command } from 'commander';
import {
  addContext,
  listContexts,
  getContext,
  enableContext,
  disableContext,
  removeContext,
  addPathToContext,
  removePathFromContext,
} from '../context';

function formatContextTable(contexts: any[]): void {
  if (contexts.length === 0) {
    console.log(chalk.yellow('No contexts registered'));
    return;
  }

  console.log();
  console.log(
    chalk.bold('ID'.padEnd(20)) +
      chalk.bold('Name'.padEnd(25)) +
      chalk.bold('Status'.padEnd(10)) +
      chalk.bold('Assets'.padEnd(10)) +
      chalk.bold('Mounts'),
  );
  console.log('─'.repeat(80));

  for (const context of contexts) {
    const id = context.id.padEnd(20);
    const name = (context.name || context.id).padEnd(25);
    const statusText = context.enabled ? 'enabled' : 'disabled';
    const status = context.enabled
      ? chalk.green(statusText.padEnd(10))
      : chalk.dim(statusText.padEnd(10));
    const assets = (context.asset_count?.toString() || '0').padEnd(10);
    const mounts = (context.mounts?.length || 0).toString();

    console.log(`${id}${name}${status}${assets}${mounts}`);
  }
  console.log();
}

async function contextAddCommand(
  path: string,
  options: {
    name?: string;
    include?: string[];
    exclude?: string[];
    parent?: string;
    mount?: string;
    versioning?: boolean;
    versionBranches?: string[];
  },
): Promise<void> {
  try {
    if (options.parent) {
      if (!options.mount) {
        console.error(chalk.red('--mount is required when using --parent'));
        console.error(
          chalk.dim(
            'Example: apr context add ./docs --parent mycontext --mount .docs',
          ),
        );
        process.exit(1);
      }

      const context = await addPathToContext(
        options.parent,
        path,
        options.mount,
      );

      console.log(chalk.green('✓ Path mounted to context'));
      console.log();
      console.log(`  Context: ${chalk.cyan(context.id)}`);
      console.log(`  Path:    ${path}`);
      console.log(`  Mount:   ${options.mount}`);
      console.log(`  Mounts:  ${context.mounts.length} total`);
      console.log();
      console.log(chalk.dim("Run 'apr index' to index the new path"));
      return;
    }

    const context = await addContext(path, {
      name: options.name,
      include_patterns: options.include,
      exclude_patterns: options.exclude,
      noVersioning: options.versioning === false,
      versionBranches: options.versionBranches,
    });

    console.log(chalk.green('✓ Context registered successfully'));
    console.log();
    console.log(`  ID:   ${chalk.cyan(context.id)}`);
    console.log(`  Name: ${context.name || context.id}`);
    console.log(`  Path: ${context.path}`);

    if (context.version_provider_type) {
      console.log(
        `  Versioning: ${chalk.green(context.version_provider_type)}`,
      );
    }

    if (context.include_patterns && context.include_patterns.length > 0) {
      console.log(`  Include: ${context.include_patterns.join(', ')}`);
    }
    if (context.exclude_patterns && context.exclude_patterns.length > 0) {
      console.log(`  Exclude: ${context.exclude_patterns.join(', ')}`);
    }

    console.log();
    console.log(chalk.dim("Run 'apr index' to start indexing this context"));
  } catch (err) {
    console.error(chalk.red(`Failed to add context: ${err}`));
    process.exit(1);
  }
}

async function contextListCommand(): Promise<void> {
  try {
    const contexts = await listContexts();
    formatContextTable(contexts);
  } catch (err) {
    console.error(chalk.red(`Failed to list contexts: ${err}`));
    process.exit(1);
  }
}

async function contextShowCommand(id: string): Promise<void> {
  try {
    const context = await getContext(id);

    if (!context) {
      console.error(chalk.red(`Context '${id}' not found`));
      process.exit(1);
    }

    console.log();
    console.log(chalk.bold(`Context: ${context.name || context.id}`));
    console.log();
    console.log(`  ID:      ${chalk.cyan(context.id)}`);
    console.log(`  Path:    ${context.path}`);

    if (context.mounts && context.mounts.length > 0) {
      console.log(`  Mounts:`);
      for (const { path: mountPath, mount } of context.mounts) {
        console.log(`           ${chalk.dim(mount + '/*')} → ${mountPath}`);
      }
    }

    console.log(
      `  Status:  ${
        context.enabled ? chalk.green('enabled') : chalk.dim('disabled')
      }`,
    );

    if (context.include_patterns && context.include_patterns.length > 0) {
      console.log(`  Include: ${context.include_patterns.join(', ')}`);
    }
    if (context.exclude_patterns && context.exclude_patterns.length > 0) {
      console.log(`  Exclude: ${context.exclude_patterns.join(', ')}`);
    }

    if (context.last_indexed_at) {
      const date = new Date(context.last_indexed_at);
      console.log(`  Last indexed: ${date.toLocaleString()}`);
    } else {
      console.log(`  Last indexed: ${chalk.dim('never')}`);
    }

    console.log();
  } catch (err) {
    console.error(chalk.red(`Failed to show context: ${err}`));
    process.exit(1);
  }
}

async function contextEnableCommand(id: string): Promise<void> {
  try {
    await enableContext(id);
    console.log(chalk.green(`✓ Context '${id}' enabled`));
  } catch (err) {
    console.error(chalk.red(`Failed to enable context: ${err}`));
    process.exit(1);
  }
}

async function contextDisableCommand(id: string): Promise<void> {
  try {
    await disableContext(id);
    console.log(chalk.yellow(`Context '${id}' disabled`));
  } catch (err) {
    console.error(chalk.red(`Failed to disable context: ${err}`));
    process.exit(1);
  }
}

async function contextRemoveCommand(id: string): Promise<void> {
  try {
    await removeContext(id);
    console.log(chalk.green(`✓ Context '${id}' removed`));
  } catch (err) {
    console.error(chalk.red(`Failed to remove context: ${err}`));
    process.exit(1);
  }
}

async function contextUnmountCommand(
  id: string,
  mountOrPath: string,
): Promise<void> {
  try {
    const context = await removePathFromContext(id, mountOrPath);
    console.log(chalk.green(`✓ Mount removed from context '${id}'`));
    console.log(`  Remaining mounts: ${context.mounts.length}`);
  } catch (err) {
    console.error(chalk.red(`Failed to unmount: ${err}`));
    process.exit(1);
  }
}

export function registerContextCommand(program: Command): void {
  const context = program
    .command('context')
    .description('Manage indexed contexts');

  context
    .command('add <path>')
    .description(
      'Register a new context or mount a path to an existing context',
    )
    .option('-n, --name <name>', 'Context name')
    .option('-p, --parent <id>', 'Mount path to existing context')
    .option(
      '-m, --mount <path>',
      'Virtual mount point (required with --parent)',
    )
    .option(
      '-i, --include <pattern>',
      'Include pattern (repeatable)',
      (val, prev) => [...prev, val],
      [] as string[],
    )
    .option(
      '-e, --exclude <pattern>',
      'Exclude pattern (repeatable)',
      (val, prev) => [...prev, val],
      [] as string[],
    )
    .option('--no-versioning', 'Disable Git version tracking')
    .option(
      '--version-branches <branches>',
      'Branches to track (comma-separated)',
      (val) => val.split(','),
    )
    .action(contextAddCommand);

  context
    .command('list')
    .alias('ls')
    .description('List all registered contexts')
    .action(contextListCommand);

  context
    .command('show <id>')
    .description('Show context details')
    .action(contextShowCommand);

  context
    .command('enable <id>')
    .description('Enable indexing for a context')
    .action(contextEnableCommand);

  context
    .command('disable <id>')
    .description('Disable indexing for a context')
    .action(contextDisableCommand);

  context
    .command('remove <id>')
    .alias('rm')
    .description('Unregister a context')
    .action(contextRemoveCommand);

  context
    .command('unmount <id> <mount>')
    .description('Remove a mount from a context (by mount point or path)')
    .action(contextUnmountCommand);
}
