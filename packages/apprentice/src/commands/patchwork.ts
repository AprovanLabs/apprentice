// Patchwork CLI Commands - Widget management from the command line

import { Command } from 'commander';
import chalk from 'chalk';
import { join } from 'node:path';
import { writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { exec } from 'node:child_process';
import {
  getContextManager,
  executeWidget,
  getPresetNames,
  getStore,
  type WidgetRuntime,
  type BrowserExecutionResult,
} from '@aprovan/patchwork';
import {
  listWidgets,
  getWidget,
  deleteWidget,
  generateWidget,
  getPatchworkConfig,
  type WidgetInfo,
} from '../patchwork';

function formatWidgetTable(widgets: WidgetInfo[]): string {
  if (widgets.length === 0) {
    return chalk.yellow('No widgets found');
  }

  const header = `${chalk.bold('NAME'.padEnd(24))} ${chalk.bold(
    'RUNTIME'.padEnd(10),
  )} ${chalk.bold('DESCRIPTION'.padEnd(40))} ${chalk.bold('SERVICES')}`;

  const rows = widgets.map((w) => {
    const name = w.name.padEnd(24).slice(0, 24);
    const runtime = w.runtime.padEnd(10);
    const desc = (w.description || '').padEnd(40).slice(0, 40);
    const services = w.services.slice(0, 2).join(', ') || '-';

    return `${name} ${runtime} ${chalk.dim(desc)} ${services}`;
  });

  return `${header}\n${rows.join('\n')}`;
}

function formatWidgetDetails(
  widget: { info: WidgetInfo; code: string },
  showCode: boolean = false,
): string {
  const { info, code } = widget;
  const lines: string[] = [];

  lines.push(chalk.bold.blue(`Widget: ${info.name}`));
  lines.push('');
  lines.push(chalk.bold('Metadata:'));
  lines.push(`  Runtime: ${info.runtime}`);
  lines.push(`  Description: ${info.description || '(none)'}`);
  lines.push(`  Services: ${info.services.join(', ') || '(none)'}`);
  lines.push(
    `  Packages: ${Object.keys(info.packages).join(', ') || '(none)'}`,
  );

  if (showCode) {
    lines.push('');
    lines.push(chalk.bold('Code:'));
    lines.push('---');
    lines.push(code);
  }

  return lines.join('\n');
}

export function createPatchworkCommand(): Command {
  const patchwork = new Command('patchwork').description(
    'Manage Patchwork widgets',
  );

  patchwork
    .command('list')
    .description('List available widgets')
    .option(
      '-r, --runtime <runtime>',
      'Filter by runtime (browser, terminal, data)',
    )
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      try {
        let widgets = await listWidgets();
        if (options.runtime) {
          widgets = widgets.filter((w) => w.runtime === options.runtime);
        }

        if (options.json) {
          console.log(JSON.stringify(widgets, null, 2));
        } else {
          console.log(
            chalk.bold(`\nPatchwork Widgets (${widgets.length} total)\n`),
          );
          console.log(formatWidgetTable(widgets));
          console.log('');
        }
      } catch (error) {
        console.error(
          chalk.red('Error:'),
          error instanceof Error ? error.message : String(error),
        );
        process.exit(1);
      }
    });

  patchwork
    .command('get <name>')
    .description('Get widget details and code')
    .option('--code-only', 'Show only code')
    .option('--json', 'Output as JSON')
    .action(async (name, options) => {
      try {
        const widget = await getWidget(name);

        if (!widget) {
          console.error(chalk.red(`Widget not found: ${name}`));
          process.exit(1);
        }

        if (options.json) {
          console.log(JSON.stringify(widget, null, 2));
        } else if (options.codeOnly) {
          console.log(widget.code);
        } else {
          console.log(formatWidgetDetails(widget, true));
        }
      } catch (error) {
        console.error(
          chalk.red('Error:'),
          error instanceof Error ? error.message : String(error),
        );
        process.exit(1);
      }
    });

  patchwork
    .command('generate <description>')
    .description('Generate a new widget from description')
    .option('-n, --name <name>', 'Override auto-generated name')
    .option(
      '-r, --runtime <runtime>',
      'Target runtime (browser, terminal, data)',
      'browser',
    )
    .option('--no-save', 'Preview without saving')
    .action(async (description, options) => {
      try {
        console.log(chalk.blue('\nGenerating widget...\n'));

        const result = await generateWidget({
          description,
          name: options.name,
          runtime: options.runtime as WidgetRuntime,
          save: options.save !== false,
        });

        if (result.success && result.path) {
          console.log(chalk.green(`✓ Generated: ${result.meta?.name}`));
          console.log(`  Runtime: ${result.meta?.runtime}`);
          console.log(
            `  Services: ${
              result.meta?.services.map((s) => s.name).join(', ') || '(none)'
            }`,
          );
          console.log(`  Path: ${result.path}`);
        } else {
          console.log(chalk.yellow('Widget generated but not saved'));
          if (result.errors.length > 0) {
            console.log(chalk.red('\nErrors:'));
            result.errors.forEach((e) => console.log(`  - ${e}`));
          }
        }
        console.log('');
      } catch (error) {
        console.error(
          chalk.red('Error:'),
          error instanceof Error ? error.message : String(error),
        );
        process.exit(1);
      }
    });

  patchwork
    .command('delete <name>')
    .description('Delete a widget')
    .option('-f, --force', 'Skip confirmation')
    .action(async (name, options) => {
      try {
        if (!options.force) {
          console.log(
            chalk.yellow(`Delete widget "${name}"? (use --force to confirm)`),
          );
          return;
        }

        const deleted = await deleteWidget(name);

        if (deleted) {
          console.log(chalk.green(`✓ Deleted: ${name}`));
        } else {
          console.error(chalk.red(`Widget not found: ${name}`));
          process.exit(1);
        }
      } catch (error) {
        console.error(
          chalk.red('Error:'),
          error instanceof Error ? error.message : String(error),
        );
        process.exit(1);
      }
    });

  patchwork
    .command('run <name>')
    .description('Execute a widget')
    .option('--props <json>', 'Props as JSON string', '{}')
    .action(async (name, options) => {
      try {
        const config = getPatchworkConfig();
        const widgets = await listWidgets();
        const widget = widgets.find((w) => w.name === name);

        if (!widget) {
          console.error(chalk.red(`Widget not found: ${name}`));
          console.log(chalk.dim('Available widgets:'));
          widgets.forEach((w) => console.log(chalk.dim(`  - ${w.name}`)));
          process.exit(1);
        }

        let props: Record<string, unknown> = {};
        try {
          props = JSON.parse(options.props);
        } catch {
          console.error(chalk.red('Invalid props JSON'));
          process.exit(1);
        }

        const ext =
          widget.runtime === 'terminal'
            ? '.ink.tsx'
            : widget.runtime === 'data'
            ? '.data.ts'
            : '.tsx';
        const widgetPath = join(config.widgetsDir, `${name}${ext}`);

        console.log(chalk.blue(`\nRunning ${name} (${widget.runtime})...\n`));

        const result = await executeWidget(widgetPath, {}, props);

        if (!result.success) {
          console.error(chalk.red('Execution failed:'), result.error);
          process.exit(1);
        }

        if (widget.runtime === 'data') {
          console.log(result.output);
        } else if (widget.runtime === 'terminal') {
          const termResult = result as { waitUntilExit?: () => Promise<void> };
          if (termResult.waitUntilExit) {
            await termResult.waitUntilExit();
          }
        } else if (widget.runtime === 'browser') {
          const browserResult = result as BrowserExecutionResult;
          if (browserResult.html) {
            // Write to temp file and open in browser
            const tempDir = join(tmpdir(), 'patchwork-widgets');
            await mkdir(tempDir, { recursive: true });
            const tempFile = join(tempDir, `${name}.html`);
            await writeFile(tempFile, browserResult.html, 'utf-8');

            console.log(chalk.dim(`Opening ${tempFile} in browser...`));

            // Open in default browser (cross-platform)
            const openCmd =
              process.platform === 'darwin'
                ? 'open'
                : process.platform === 'win32'
                ? 'start'
                : 'xdg-open';
            exec(`${openCmd} "${tempFile}"`);
          }
        }
      } catch (error) {
        console.error(
          chalk.red('Error:'),
          error instanceof Error ? error.message : String(error),
        );
        process.exit(1);
      }
    });

  patchwork
    .command('presets')
    .description('List available layout presets')
    .action(() => {
      const presets = getPresetNames();
      console.log(chalk.bold('\nLayout Presets\n'));
      presets.forEach((p) => console.log(`  - ${p}`));
      console.log('');
    });

  patchwork
    .command('store')
    .description('Interact with shared state store')
    .option('--get <key>', 'Get value by key')
    .option('--set <key=value>', 'Set key=value')
    .option('--keys', 'List all keys')
    .option('--clear', 'Clear all values')
    .action((options) => {
      const store = getStore();

      if (options.keys) {
        const keys = store.keys();
        console.log(chalk.bold(`\nStore Keys (${keys.length})\n`));
        keys.forEach((k) => console.log(`  ${k}`));
        console.log('');
        return;
      }

      if (options.get) {
        const value = store.get(options.get);
        console.log(JSON.stringify(value, null, 2));
        return;
      }

      if (options.set) {
        const [key, ...rest] = options.set.split('=');
        const value = rest.join('=');
        try {
          store.set(key, JSON.parse(value));
        } catch {
          store.set(key, value);
        }
        console.log(chalk.green(`✓ Set ${key}`));
        return;
      }

      if (options.clear) {
        store.clear();
        console.log(chalk.green('✓ Store cleared'));
        return;
      }

      console.log(chalk.yellow('Use --get, --set, --keys, or --clear'));
    });

  patchwork
    .command('context')
    .description('Show current aggregated context')
    .option('--json', 'Output as JSON')
    .option('-p, --provider <name>', 'Show only specific provider')
    .action(async (options) => {
      try {
        const contextManager = getContextManager();
        const context = contextManager.getContext();

        if (options.json) {
          if (options.provider) {
            console.log(
              JSON.stringify(
                context.providers[options.provider] || {},
                null,
                2,
              ),
            );
          } else {
            console.log(JSON.stringify(context, null, 2));
          }
          return;
        }

        console.log(chalk.bold('\nCurrent Context\n'));

        const providers = options.provider
          ? [options.provider]
          : Object.keys(context.providers);

        if (providers.length === 0) {
          console.log(chalk.yellow('No context providers registered'));
        } else {
          for (const provider of providers) {
            const ctx = context.providers[provider];
            if (!ctx) {
              console.log(chalk.yellow(`  ${provider}: (not found)`));
              continue;
            }
            console.log(`  ${chalk.blue(provider)}:`);
            for (const [key, value] of Object.entries(ctx)) {
              const displayValue =
                typeof value === 'object'
                  ? JSON.stringify(value)
                  : String(value);
              console.log(`    ${key}: ${displayValue.slice(0, 60)}`);
            }
            console.log('');
          }
        }

        console.log(
          chalk.dim(`Last updated: ${context.timestamp || 'unknown'}`),
        );
        console.log('');
      } catch (error) {
        console.error(
          chalk.red('Error:'),
          error instanceof Error ? error.message : String(error),
        );
        process.exit(1);
      }
    });

  return patchwork;
}

export { createPatchworkCommand as patchworkCommand };
