// Patchwork Layout - Slot-based layout system for widget orchestration

export * from './types.js';
export { PRESETS, getPreset, getPresetNames } from './presets.js';
export {
  createTerminalLayoutManager,
  renderLayout,
  type TerminalLayoutManagerOptions,
} from './terminal.js';
export {
  createBrowserLayoutManager,
  generateLayoutCSS,
  generateLayoutHTML,
  getLayoutAssets,
  type BrowserLayoutOptions,
} from './browser.js';
export {
  createHotReloadManager,
  getHotReloadManager,
  startHotReload,
  stopHotReload,
  isDevMode,
  type HotReloadOptions,
  type HotReloadManager,
  type WidgetChangeEvent,
} from './hot-reload.js';
