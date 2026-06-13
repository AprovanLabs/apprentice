// Shared redaction utilities for indexer
import { redact } from '../redact';
import type { Event } from '../types/event';

/**
 * Redact sensitive data from an event
 */
export function redactEvent(event: Event): Event {
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
