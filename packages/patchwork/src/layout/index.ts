// Patchwork Layout - Slot-based layout system for widget orchestration

export * from './types';
export {
  createTerminalLayoutManager,
  renderLayout,
  type TerminalLayoutManagerOptions,
} from './terminal';
export {
  createBrowserLayoutManager,
  generateLayoutCSS,
  generateLayoutHTML,
  getLayoutAssets,
  type BrowserLayoutOptions,
} from './browser';
export {
  createHotReloadManager,
  getHotReloadManager,
  startHotReload,
  stopHotReload,
  isDevMode,
  type HotReloadOptions,
  type HotReloadManager,
  type WidgetChangeEvent,
} from './hot-reload';
