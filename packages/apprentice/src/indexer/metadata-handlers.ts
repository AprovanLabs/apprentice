export interface MetadataHandler {
  name: string;
  extensions: string[];
  priority?: number;
  extract: (
    filePath: string,
    content: string,
  ) => Promise<Record<string, unknown>> | Record<string, unknown>;
}

const handlers: MetadataHandler[] = [];

export function registerMetadataHandler(handler: MetadataHandler): void {
  handlers.push(handler);
  handlers.sort((a, b) => (b.priority || 0) - (a.priority || 0));
}

export function getHandlersForExtension(extension: string): MetadataHandler[] {
  return handlers.filter((h) => h.extensions.includes(extension));
}

export async function extractMetadata(
  filePath: string,
  content: string,
  extension: string,
): Promise<Record<string, unknown>> {
  const applicableHandlers = getHandlersForExtension(extension);

  if (applicableHandlers.length === 0) {
    return {};
  }

  const metadata: Record<string, unknown> = {};

  for (const handler of applicableHandlers) {
    try {
      const handlerMetadata = await handler.extract(filePath, content);

      if (!handlerMetadata || Object.keys(handlerMetadata).length === 0) {
        continue;
      }

      Object.assign(metadata, {
        [handler.name]: handlerMetadata,
      });
    } catch (error) {
      console.error(
        `Metadata handler '${handler.name}' failed for ${filePath}:`,
        error,
      );
    }
  }

  return metadata;
}

export function getAllHandlers(): MetadataHandler[] {
  return [...handlers];
}
