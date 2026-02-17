import { indexAllContexts } from './indexer/index-loop';
import { processBashLog, processChatLog } from './indexer/event-processor';
import { generateAssetEmbeddings } from './indexer/embedding-generator';
import { paths, config, loadUserConfig } from './config';
import { getDb, closeDb, checkpoint } from './db';
import { runChatImport } from './import-chat';
import { adapters } from './importers';
import {
  loadEmbeddingConfig,
  getEmbeddingProvider,
  getEmbeddingConfig,
} from './embeddings';
import {
  getEventsWithoutEmbeddings,
  batchUpsertEventEmbeddings,
} from './search/vector';

// WAL checkpoint interval - every 5 minutes
const WAL_CHECKPOINT_INTERVAL_MS = 5 * 60 * 1000;

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

async function runIndexerCycle(): Promise<void> {
  const assetResults = await indexAllContexts();
  const bashCount = await processBashLog(paths.logFile);
  const chatCount = await processChatLog(paths.chatLogFile);
  const assetEmbeddings = await generateAssetEmbeddings(100);
  const eventEmbeddings = await generateEventEmbeddings(100);

  const totalFiles = assetResults.reduce((sum, r) => sum + r.filesProcessed, 0);
  const totalAdded = assetResults.reduce((sum, r) => sum + r.filesAdded, 0);
  const totalUpdated = assetResults.reduce((sum, r) => sum + r.filesUpdated, 0);

  if (
    totalFiles > 0 ||
    bashCount > 0 ||
    chatCount > 0 ||
    assetEmbeddings > 0 ||
    eventEmbeddings > 0
  ) {
    const parts: string[] = [];
    if (totalAdded > 0 || totalUpdated > 0) {
      parts.push(`${totalAdded + totalUpdated} assets`);
    }
    if (bashCount > 0 || chatCount > 0) {
      parts.push(`${bashCount + chatCount} events`);
    }
    if (assetEmbeddings > 0 || eventEmbeddings > 0) {
      parts.push(`${assetEmbeddings + eventEmbeddings} embeddings`);
    }
    console.log(`Indexed: ${parts.join(', ')}`);
  }
}

export async function main(): Promise<void> {
  const userConfig = loadUserConfig();

  const chatImportEnabled =
    userConfig.chatImport?.enabled ?? config.chatImport.enabled;
  const chatImportInterval =
    userConfig.chatImport?.intervalMs ?? config.chatImport.intervalMs;

  const embeddingConfig = loadEmbeddingConfig(userConfig.embeddings);

  console.log('Apprentice Indexer starting...');
  console.log(`Database: ${paths.database}`);
  console.log(`Index interval: ${config.indexerIntervalMs}ms`);
  console.log(
    `Chat import: ${
      chatImportEnabled
        ? `enabled (every ${chatImportInterval / 1000}s)`
        : 'disabled'
    }`,
  );
  console.log(
    `Embeddings: ${embeddingConfig.enabled ? 'enabled' : 'disabled'}`,
  );

  getDb();

  console.log('\nRunning initial indexing...');
  await runIndexerCycle();

  if (chatImportEnabled) {
    try {
      const importResults = await runChatImport(adapters);
      const total = Object.values(importResults).reduce((a, b) => a + b, 0);
      if (total > 0) {
        console.log(`Chat import: ${total} messages`);
      }
    } catch (err) {
      console.error('Chat import error:', err);
    }
  }

  setInterval(async () => {
    try {
      await runIndexerCycle();
    } catch (err) {
      console.error('Indexer error:', err);
    }
  }, config.indexerIntervalMs);

  if (chatImportEnabled) {
    setInterval(async () => {
      try {
        const results = await runChatImport(adapters);
        const total = Object.values(results).reduce((a, b) => a + b, 0);
        if (total > 0) {
          console.log(`Chat import: ${total} messages`);
        }
      } catch (err) {
        console.error('Chat import error:', err);
      }
    }, chatImportInterval);
  }

  // Periodic WAL checkpoint to prevent unbounded WAL growth
  setInterval(async () => {
    try {
      const result = await checkpoint('PASSIVE');
      if (result && result.walPagesWritten > 0) {
        console.log(
          `WAL checkpoint: ${result.walPagesWritten}/${result.walPagesTotal} pages`,
        );
      }
    } catch (err) {
      console.error('WAL checkpoint error:', err);
    }
  }, WAL_CHECKPOINT_INTERVAL_MS);

  process.on('SIGINT', async () => {
    console.log('\nShutting down indexer...');
    await closeDb();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('\nShutting down indexer...');
    await closeDb();
    process.exit(0);
  });
}

const entryFile = process.argv[1] ?? '';
const isIndexerMain =
  entryFile.endsWith('indexer-daemon.js') ||
  entryFile.endsWith('indexer-daemon.ts');

if (isIndexerMain) {
  main().catch(console.error);
}
