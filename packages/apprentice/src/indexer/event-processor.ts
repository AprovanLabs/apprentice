import { createReadStream, existsSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { insertEvent } from '../events';
import { getIndexerState, updateIndexerState } from '../db';
import { redact } from '../redact';
import type { Event } from '../types';

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

export async function processEventLog(
  logFile: string,
  stateKey: string,
): Promise<number> {
  if (!existsSync(logFile)) {
    return 0;
  }

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

    if (lineNumber <= logState.lastProcessedLine) {
      continue;
    }

    if (!line.trim()) {
      continue;
    }

    try {
      const event = JSON.parse(line) as Event;
      const redactedEvent = redactEvent(event);

      await insertEvent(redactedEvent);

      indexedCount++;
      lastTimestamp = event.timestamp;
    } catch (err) {
      console.error(
        `Skipping malformed line ${lineNumber} in ${stateKey}:`,
        err,
      );
    }
  }

  await updateIndexerState(stateKey, {
    lastProcessedLine: lineNumber,
    lastProcessedTimestamp: lastTimestamp,
  });

  return indexedCount;
}

export async function processBashLog(logFile: string): Promise<number> {
  return processEventLog(logFile, 'bash');
}

export async function processChatLog(logFile: string): Promise<number> {
  return processEventLog(logFile, 'chat');
}
