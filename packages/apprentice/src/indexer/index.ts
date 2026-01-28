export { discoverFiles } from './file-discovery';
export { computeContentHash, computeContentHashSync } from './content-hash';
export {
  registerMetadataHandler,
  getHandlersForExtension,
  extractMetadata,
  getAllHandlers,
  type MetadataHandler,
} from './metadata-handlers';
export { shellScriptHandler } from './handlers/shell-script';
export { markdownHandler } from './handlers/markdown';
export {
  indexContext,
  indexAllContexts,
  type IndexerResult,
} from './index-loop';
export { generateSummary, type SummaryResult } from './summarizer';
export { generateAssetEmbeddings } from './embedding-generator';
export {
  processEventLog,
  processBashLog,
  processChatLog,
} from './event-processor';
