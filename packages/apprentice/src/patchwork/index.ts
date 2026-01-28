// Patchwork Generation - Re-exports generation functionality
// These are kept in apprentice due to tight coupling with AI and config

export * from './generation/index.js';
export { patchworkTools, handlePatchworkTool } from './mcp-tools.js';
export {
  getPatchworkConfig,
  ensureWidgetsDir,
  type PatchworkConfig,
} from './config.js';
export {
  generateLayout,
  buildLayoutSchema,
  buildLayoutPrompt,
  getAvailableWidgets,
  getSlotDimensions,
  type LayoutContext,
  type LayoutPromptSchema,
  type LayoutGenerationResult,
} from './llm-prompt.js';
