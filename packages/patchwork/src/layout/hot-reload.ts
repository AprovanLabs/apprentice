// Widget Hot-Reload - File watcher for development mode

import { watch, type FSWatcher } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, extname, relative } from 'node:path';
import { EventEmitter } from 'node:events';
import { getPatchworkConfig } from '../runtime/config.js';
import { generateContentHash } from '../runtime/loader.js';

export interface HotReloadOptions {
  widgetsDir?: string;
  preserveState?: boolean;
  debounceMs?: number;
}

export interface WidgetChangeEvent {
  type: 'add' | 'change' | 'unlink';
  path: string;
  name: string;
  hash?: string;
}

export interface HotReloadManager extends EventEmitter {
  start(): Promise<void>;
  stop(): void;
  isWatching(): boolean;
  getWatchedFiles(): string[];
  on(event: 'change', listener: (event: WidgetChangeEvent) => void): this;
  on(event: 'error', listener: (error: Error) => void): this;
  on(event: 'ready', listener: () => void): this;
}

const WIDGET_EXTENSIONS = ['.tsx', '.ts', '.jsx', '.js'];

function isWidgetFile(path: string): boolean {
  const ext = extname(path);
  return (
    WIDGET_EXTENSIONS.includes(ext) &&
    !path.includes('node_modules') &&
    !path.includes('.cache')
  );
}

function getWidgetName(path: string, widgetsDir: string): string {
  const rel = relative(widgetsDir, path);
  return rel.replace(/\.(ink|data)?\.(tsx?|jsx?)$/, '').replace(/[/\\]/g, '-');
}

export function createHotReloadManager(
  options: HotReloadOptions = {},
): HotReloadManager {
  const config = getPatchworkConfig();
  const widgetsDir = options.widgetsDir || config.widgetsDir;
  const debounceMs = options.debounceMs ?? 100;

  const emitter = new EventEmitter() as HotReloadManager;
  let watcher: FSWatcher | null = null;
  let watching = false;
  const fileHashes = new Map<string, string>();
  const watchedFiles = new Set<string>();
  const pendingChanges = new Map<string, NodeJS.Timeout>();

  async function processChange(
    path: string,
    _eventType: 'rename' | 'change',
  ): Promise<void> {
    if (!isWidgetFile(path)) return;

    const fullPath = path.startsWith(widgetsDir)
      ? path
      : join(widgetsDir, path);
    const name = getWidgetName(fullPath, widgetsDir);

    const pending = pendingChanges.get(fullPath);
    if (pending) clearTimeout(pending);

    pendingChanges.set(
      fullPath,
      setTimeout(async () => {
        pendingChanges.delete(fullPath);

        try {
          const exists = existsSync(fullPath);

          if (!exists) {
            if (watchedFiles.has(fullPath)) {
              watchedFiles.delete(fullPath);
              fileHashes.delete(fullPath);
              emitter.emit('change', { type: 'unlink', path: fullPath, name });
            }
            return;
          }

          const content = await readFile(fullPath, 'utf-8');
          const hash = generateContentHash(content);
          const prevHash = fileHashes.get(fullPath);

          if (prevHash === hash) return;

          const isNew = !watchedFiles.has(fullPath);
          fileHashes.set(fullPath, hash);
          watchedFiles.add(fullPath);

          emitter.emit('change', {
            type: isNew ? 'add' : 'change',
            path: fullPath,
            name,
            hash,
          });
        } catch (err) {
          emitter.emit(
            'error',
            err instanceof Error ? err : new Error(String(err)),
          );
        }
      }, debounceMs),
    );
  }

  emitter.start = async function (): Promise<void> {
    if (watching) return;
    if (!existsSync(widgetsDir)) {
      emitter.emit(
        'error',
        new Error(`Widgets directory not found: ${widgetsDir}`),
      );
      return;
    }

    watcher = watch(widgetsDir, { recursive: true }, (eventType, filename) => {
      if (filename) processChange(filename, eventType);
    });

    watcher.on('error', (err) => emitter.emit('error', err));

    watching = true;
    emitter.emit('ready');
  };

  emitter.stop = function (): void {
    if (watcher) {
      watcher.close();
      watcher = null;
    }
    for (const timeout of pendingChanges.values()) {
      clearTimeout(timeout);
    }
    pendingChanges.clear();
    watching = false;
  };

  emitter.isWatching = function (): boolean {
    return watching;
  };

  emitter.getWatchedFiles = function (): string[] {
    return [...watchedFiles];
  };

  return emitter;
}

let globalManager: HotReloadManager | null = null;

export function getHotReloadManager(
  options?: HotReloadOptions,
): HotReloadManager {
  if (!globalManager) {
    globalManager = createHotReloadManager(options);
  }
  return globalManager;
}

export function isDevMode(): boolean {
  return (
    process.env.NODE_ENV === 'development' || process.env.PATCHWORK_DEV === '1'
  );
}

export async function startHotReload(
  options?: HotReloadOptions,
): Promise<HotReloadManager> {
  const manager = getHotReloadManager(options);
  await manager.start();
  return manager;
}

export function stopHotReload(): void {
  if (globalManager) {
    globalManager.stop();
    globalManager = null;
  }
}
