// CLI command for importing chat history from AI assistants

import { Command } from 'commander';
import {
  importFromAdapter,
  runChatImport,
  getImportStatus,
  clearImportState,
} from '../import-chat';
import { adapters, getAdapter, getAvailableSources } from '../importers';

/**
 * Register the import command with the CLI program
 */
export function registerImportCommand(program: Command): void {
  const importCmd = program
    .command('import')
    .description('Import data from external sources');

  importCmd
    .command('chat')
    .description('Import chat history from AI assistants')
    .option('-s, --source <source>', 'Import from specific source only')
    .option('--list-sources', 'List available import sources')
    .option('--status', 'Show import status for all sources')
    .option('--reset [source]', 'Reset import state (re-import all)')
    .option('-v, --verbose', 'Show verbose output')
    .action(async (options) => {
      // List available sources
      if (options.listSources) {
        console.log('Available import sources:');
        for (const adapter of adapters) {
          console.log(`  ${adapter.sourceId.padEnd(12)} ${adapter.sourceName}`);
        }
        return;
      }

      // Show import status
      if (options.status) {
        const status = await getImportStatus();
        console.log('Import status:');

        for (const adapter of adapters) {
          const sourceStatus = status.sources[adapter.sourceId];
          if (sourceStatus) {
            const sessionCount = Object.keys(
              sourceStatus.importedSessions,
            ).length;
            const lastImport = sourceStatus.lastImportTime
              ? new Date(sourceStatus.lastImportTime).toLocaleString()
              : 'Never';
            console.log(`\n${adapter.sourceName}:`);
            console.log(`  Sessions imported: ${sessionCount}`);
            console.log(`  Last import: ${lastImport}`);
          } else {
            console.log(`\n${adapter.sourceName}:`);
            console.log(`  Not yet imported`);
          }
        }
        return;
      }

      // Reset import state
      if (options.reset !== undefined) {
        const sourceToReset =
          typeof options.reset === 'string' ? options.reset : undefined;
        if (sourceToReset) {
          clearImportState(sourceToReset);
          console.log(`Reset import state for: ${sourceToReset}`);
        } else {
          clearImportState();
          console.log('Reset import state for all sources');
        }
        return;
      }

      // Import from specific source or all
      if (options.source) {
        const adapter = getAdapter(options.source);
        if (!adapter) {
          console.error(`Unknown source: ${options.source}`);
          console.error(`Available: ${getAvailableSources().join(', ')}`);
          process.exit(1);
        }

        console.log(`Importing from ${adapter.sourceName}...`);
        const count = await importFromAdapter(adapter, {
          verbose: options.verbose,
        });
        console.log(`Imported ${count} messages from ${adapter.sourceName}`);
      } else {
        // Import from all sources
        console.log('Importing from all sources...');
        const results = await runChatImport(adapters, {
          verbose: options.verbose,
        });

        let total = 0;
        for (const [sourceId, count] of Object.entries(results)) {
          const adapter = getAdapter(sourceId);
          console.log(
            `  ${adapter?.sourceName ?? sourceId}: ${count} messages`,
          );
          total += count;
        }
        console.log(`\nTotal: ${total} messages imported`);
      }
    });
}
