import chalk from 'chalk';
import {
  indexContext,
  indexAllContexts,
  type IndexOptions,
} from '../indexer/index-loop';
import { processBashLog, processChatLog } from '../indexer/event-processor';
import { generateAssetEmbeddings } from '../indexer/embedding-generator';
import { paths, loadUserConfig } from '../config';
import { listContexts } from '../context';
import {
  getEventsWithoutEmbeddings,
  batchUpsertEventEmbeddings,
} from '../search/vector';
import {
  getEmbeddingProvider,
  getEmbeddingConfig,
  loadEmbeddingConfig,
} from '../embeddings';
import { getDb } from '../db';

interface IndexCommandOptions {
  context?: string;
  all?: boolean;
  versionsOnly?: boolean;
  noVersions?: boolean;
  versionDepth?: number;
}

export async function indexCommand(
  options: IndexCommandOptions,
): Promise<void> {
  const startTime = Date.now();

  const userConfig = loadUserConfig();
  loadEmbeddingConfig(userConfig.embeddings);

  console.log(chalk.bold('\n🔄 Starting indexer...\n'));

  let assetResults: any[] = [];
  let eventCount = 0;
  let embeddingCount = 0;

  const indexOpts: IndexOptions = {
    versionsOnly: options.versionsOnly,
    noVersions: options.noVersions,
    versionDepth: options.versionDepth,
  };

  if (options.context) {
    console.log(chalk.cyan(`📁 Indexing context: ${options.context}`));
    const result = await indexContext(options.context, indexOpts);
    assetResults = [result];
  } else {
    const contexts = await listContexts();
    const targetContexts = options.all
      ? contexts
      : contexts.filter((c) => c.enabled);

    if (targetContexts.length === 0) {
      console.log(chalk.yellow('⚠️  No contexts to index'));
      console.log(
        chalk.dim("Run 'apr context add <path>' to register a context"),
      );
      return;
    }

    console.log(chalk.cyan(`📁 Indexing ${targetContexts.length} contexts...`));
    assetResults = await indexAllContexts(indexOpts);
  }

  // Process event logs
  console.log(chalk.cyan('\n📝 Processing event logs...'));
  const bashCount = await processBashLog(paths.logFile);
  const chatCount = await processChatLog(paths.chatLogFile);
  eventCount = bashCount + chatCount;
  console.log(
    chalk.dim(`   Indexed ${bashCount} bash events, ${chatCount} chat events`),
  );

  // Generate embeddings
  console.log(chalk.cyan('\n🧠 Generating embeddings...'));
  const assetEmbeddings = await generateAssetEmbeddings(200);
  const eventEmbeddings = await generateEventEmbeddings(200);
  embeddingCount = assetEmbeddings + eventEmbeddings;
  console.log(
    chalk.dim(
      `   Generated ${assetEmbeddings} asset embeddings, ${eventEmbeddings} event embeddings`,
    ),
  );

  // Summary
  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(chalk.bold('\n✓ Indexing complete\n'));
  console.log(chalk.dim('─'.repeat(50)));

  if (assetResults.length > 0) {
    const totalFiles = assetResults.reduce(
      (sum, r) => sum + r.filesProcessed,
      0,
    );
    const totalAdded = assetResults.reduce((sum, r) => sum + r.filesAdded, 0);
    const totalUpdated = assetResults.reduce(
      (sum, r) => sum + r.filesUpdated,
      0,
    );
    const totalSkipped = assetResults.reduce(
      (sum, r) => sum + r.filesSkipped,
      0,
    );
    const totalErrors = assetResults.reduce((sum, r) => sum + r.errors, 0);

    console.log(`  Files processed: ${chalk.bold(totalFiles)}`);
    console.log(`    ${chalk.green('New:')} ${totalAdded}`);
    console.log(`    ${chalk.blue('Updated:')} ${totalUpdated}`);
    console.log(`    ${chalk.dim('Unchanged:')} ${totalSkipped}`);
    if (totalErrors > 0) {
      console.log(`    ${chalk.red('Errors:')} ${totalErrors}`);
    }
  }

  if (eventCount > 0) {
    console.log(`  Events indexed: ${chalk.bold(eventCount)}`);
  }

  if (embeddingCount > 0) {
    console.log(`  Embeddings generated: ${chalk.bold(embeddingCount)}`);
  }

  console.log(`  Duration: ${chalk.dim(duration + 's')}`);
  console.log(chalk.dim('─'.repeat(50)));
  console.log();
}

async function generateEventEmbeddings(batchSize: number): Promise<number> {
  const config = getEmbeddingConfig();
  if (!config.enabled) {
    return 0;
  }

  const provider = getEmbeddingProvider(config.model);
  const db = getDb();

  const events = await getEventsWithoutEmbeddings(db, batchSize);

  if (events.length === 0) {
    return 0;
  }

  const texts = events.map((event) => {
    const parts = [event.message];
    const shellMetadata = event.metadata.shell as any;
    const outputPreview = shellMetadata?.output_preview as string | undefined;
    if (outputPreview && outputPreview.trim()) {
      parts.push(outputPreview.trim().slice(0, 500));
    }
    return parts.join('\n');
  });

  try {
    const embeddings = await provider.embedBatch(texts);

    await batchUpsertEventEmbeddings(
      db,
      events.map((event, i) => ({
        eventId: event.id,
        embedding: embeddings[i]!,
        model: provider.model,
      })),
    );

    return events.length;
  } catch (error) {
    console.error('Failed to generate event embeddings:', error);
    return 0;
  }
}
