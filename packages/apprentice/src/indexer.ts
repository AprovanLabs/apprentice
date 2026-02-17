// Batch indexer for Apprentice
// Reads new entries from bash.log and indexes them into SQLite
// Also handles auto-import of chat history from AI assistants

import { createReadStream, existsSync, readdirSync, statSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { join, extname, basename } from 'node:path';

import { paths, config, loadUserConfig } from './config';
import { redact } from './redact';
import {
  insertEvent,
  getDb,
  closeDb,
  getIndexerState,
  updateIndexerState,
} from './db';
import { runChatImport } from './import-chat';
import { adapters } from './importers';
import {
  loadEmbeddingConfig,
  getEmbeddingProvider,
  type EmbeddingProvider,
} from './embeddings';
import {
  getEventsWithoutEmbeddings,
  batchUpsertEventEmbeddings,
} from './search/vector';
import type { Event } from './types';

/**
 * Redact sensitive data from an event
 */
function redactEvent(event: Event): Event {
  const redactedMessage = redact(event.message);

  const redactedMetadata = { ...event.metadata };
  const shellMetadata = redactedMetadata.shell as any;
  if (shellMetadata?.output_preview) {
    shellMetadata.output_preview = redact(shellMetadata.output_preview);
  }

  return {
    ...event,
    message: redactedMessage,
    metadata: redactedMetadata,
  };
}

/**
 * Index new events from a log file
 */
async function indexLogFile(
  logFile: string,
  stateKey: string,
): Promise<number> {
  if (!existsSync(logFile)) {
    return 0;
  }

  // Get state from SQLite
  const logState = (await getIndexerState(stateKey)) ?? {
    lastProcessedLine: 0,
    lastProcessedTimestamp: '',
  };
  let lineNumber = 0;
  let indexedCount = 0;
  let lastTimestamp = logState.lastProcessedTimestamp;

  const fileStream = createReadStream(logFile);
  const rl = createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    lineNumber++;

    // Skip already processed lines
    if (lineNumber <= logState.lastProcessedLine) {
      continue;
    }

    // Skip empty lines
    if (!line.trim()) {
      continue;
    }

    try {
      // Parse the event (already in the correct format)
      const event = JSON.parse(line) as Event;

      // Apply redaction to sensitive data
      const redactedEvent = redactEvent(event);

      // Insert into database
      await insertEvent(redactedEvent);

      indexedCount++;
      lastTimestamp = event.timestamp;
    } catch (err) {
      // Skip malformed lines
      console.error(
        `Skipping malformed line ${lineNumber} in ${stateKey}:`,
        err,
      );
    }
  }

  // Save state to SQLite
  await updateIndexerState(stateKey, {
    lastProcessedLine: lineNumber,
    lastProcessedTimestamp: lastTimestamp,
  });

  return indexedCount;
}

/**
 * Index new commands from the bash log file
 */
async function indexCommands(): Promise<number> {
  return indexLogFile(paths.logFile, 'bash');
}

/**
 * Index chat events from the chat log file
 */
async function indexChat(): Promise<number> {
  return indexLogFile(paths.chatLogFile, 'chat');
}

/**
 * Index scripts from the scripts directory
 */
async function indexScripts(): Promise<number> {
  if (!existsSync(paths.scripts)) {
    return 0;
  }

  // Get metadata from SQLite
  const metadata = await getAllScriptMetadata();
  const validExtensions = Object.keys(config.scriptRunners);
  let indexedCount = 0;

  const files = readdirSync(paths.scripts);

  for (const file of files) {
    // Skip metadata file and hidden files
    if (file.startsWith('_') || file.startsWith('.')) {
      continue;
    }

    const filePath = join(paths.scripts, file);
    const stat = statSync(filePath);

    // Skip directories and subdirectories for now
    if (stat.isDirectory()) {
      continue;
    }

    const ext = extname(file);
    if (!validExtensions.includes(ext)) {
      continue;
    }

    const name = basename(file, ext);
    const scriptMeta = (metadata as any)[name];

    await upsertScript({
      name,
      path: filePath,
      extension: ext,
      description: scriptMeta?.description,
      tags: scriptMeta?.tags,
    });

    indexedCount++;
  }

  return indexedCount;
}

/**
 * Run a single indexing pass
 */
export async function runIndexer(): Promise<{
  commands: number;
  chat: number;
  scripts: number;
}> {
  // Ensure database is initialized
  getDb();

  const commands = await indexCommands();
  const chat = await indexChat();
  const scripts = await indexScripts();

  return { commands, chat, scripts };
}

/**
 * Generate embeddings for events that don't have them yet
 */
async function generateEmbeddings(
  provider: EmbeddingProvider,
  batchSize = 50,
): Promise<number> {
  const db = getDb();

  // Get events without embeddings
  const events = await getEventsWithoutEmbeddings(db, batchSize);

  if (events.length === 0) {
    return 0;
  }

  // Create text content for embedding
  // Combine message with output preview for better semantic matching
  const texts = events.map((event) => {
    const parts = [event.message];
    const shellMetadata = event.metadata.shell as any;
    const outputPreview = shellMetadata?.output_preview as string | undefined;
    if (outputPreview && outputPreview.trim()) {
      parts.push(outputPreview.trim().slice(0, 500)); // Limit output size
    }
    return parts.join('\n');
  });

  try {
    // Generate embeddings in batch
    const embeddings = await provider.embedBatch(texts);

    // Store embeddings
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
    console.error('Failed to generate embeddings:', error);
    return 0;
  }
}

/**
 * Main entry point for the indexer daemon
 */
async function main(): Promise<void> {
  const userConfig = loadUserConfig();

  // Merge user config with defaults
  const chatImportEnabled =
    userConfig.chatImport?.enabled ?? config.chatImport.enabled;
  const chatImportInterval =
    userConfig.chatImport?.intervalMs ?? config.chatImport.intervalMs;

  // Embedding configuration
  const embeddingConfig = loadEmbeddingConfig(userConfig.embeddings);
  let embeddingProvider: EmbeddingProvider | null = null;

  if (embeddingConfig.enabled) {
    try {
      embeddingProvider = getEmbeddingProvider(embeddingConfig.model);
    } catch (err) {
      console.error('Failed to initialize embedding provider:', err);
    }
  }

  console.log('Apprentice Indexer starting...');
  console.log(`Log file: ${paths.logFile}`);
  console.log(`Chat log: ${paths.chatLogFile}`);
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
    `Embeddings: ${
      embeddingProvider
        ? `enabled (${embeddingProvider.name}/${embeddingProvider.model})`
        : 'disabled'
    }`,
  );

  // Initial indexing run
  const initial = await runIndexer();
  console.log(
    `Initial index: ${initial.commands} commands, ${initial.chat} chat messages, ${initial.scripts} scripts`,
  );

  // Initial chat import if enabled
  if (chatImportEnabled) {
    try {
      const importResults = await runChatImport(adapters);
      const total = Object.values(importResults).reduce((a, b) => a + b, 0);
      if (total > 0) {
        console.log(`Initial chat import: ${total} messages`);
      }
    } catch (err) {
      console.error('Chat import error:', err);
    }
  }

  // Initial embedding generation if enabled
  if (embeddingProvider) {
    try {
      const embeddedCount = await generateEmbeddings(embeddingProvider, 100);
      if (embeddedCount > 0) {
        console.log(`Initial embeddings: ${embeddedCount} events`);
      }
    } catch (err) {
      console.error('Embedding generation error:', err);
    }
  }

  // Schedule periodic indexing
  setInterval(async () => {
    try {
      const result = await runIndexer();
      if (result.commands > 0 || result.chat > 0 || result.scripts > 0) {
        console.log(
          `Indexed: ${result.commands} commands, ${result.chat} chat messages, ${result.scripts} scripts`,
        );
      }

      // Generate embeddings after indexing
      if (embeddingProvider) {
        const embeddedCount = await generateEmbeddings(embeddingProvider, 50);
        if (embeddedCount > 0) {
          console.log(`Embeddings: ${embeddedCount} events`);
        }
      }
    } catch (err) {
      console.error('Indexer error:', err);
    }
  }, config.indexerIntervalMs);

  // Schedule periodic chat import if enabled
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

  // Handle graceful shutdown
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

// Only run main if executed as the indexer entry point directly
// (not when imported into cli.js or other modules)
const entryFile = process.argv[1] ?? '';
const isIndexerMain =
  entryFile.endsWith('indexer.js') || entryFile.endsWith('indexer.ts');

if (isIndexerMain) {
  main().catch(console.error);
}
