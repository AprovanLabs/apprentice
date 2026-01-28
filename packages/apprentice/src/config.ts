// Configuration and paths for Apprentice

import { existsSync, readFileSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { join } from 'node:path';
import { load } from 'js-yaml';
import { config as loadDotenv } from 'dotenv';
import lodash from 'lodash';

const { merge, cloneDeepWith } = lodash;

// Load .env file if it exists (before any other initialization)
const APPRENTICE_HOME =
  process.env.APPRENTICE_HOME ?? join(homedir(), '.apprentice');
const envPath = join(APPRENTICE_HOME, '.env');
if (existsSync(envPath)) {
  loadDotenv({ path: envPath, quiet: true });
}

export { APPRENTICE_HOME };

export const paths = {
  home: APPRENTICE_HOME,
  configFile: join(APPRENTICE_HOME, 'config.yaml'),
  memory: join(APPRENTICE_HOME, 'memory'),
  logs: join(APPRENTICE_HOME, 'memory', 'logs'),
  logFile: join(APPRENTICE_HOME, 'memory', 'logs', 'bash.log'),
  chatLogFile: join(APPRENTICE_HOME, 'memory', 'logs', 'chat.log'),
  scripts: join(APPRENTICE_HOME, 'memory', 'scripts'),
  database: join(APPRENTICE_HOME, 'memory', 'index.db'),
} as const;

/**
 * Get platform-specific path for VS Code workspace storage
 */
function getVSCodeWorkspaceStorage(): string {
  const home = homedir();
  switch (platform()) {
    case 'darwin':
      return join(
        home,
        'Library/Application Support/Code/User/workspaceStorage',
      );
    case 'win32':
      return join(process.env.APPDATA ?? home, 'Code/User/workspaceStorage');
    default: // linux
      return join(home, '.config/Code/User/workspaceStorage');
  }
}

/**
 * Get platform-specific path for Cursor workspace storage
 */
function getCursorWorkspaceStorage(): string {
  const home = homedir();
  switch (platform()) {
    case 'darwin':
      return join(
        home,
        'Library/Application Support/Cursor/User/workspaceStorage',
      );
    case 'win32':
      return join(process.env.APPDATA ?? home, 'Cursor/User/workspaceStorage');
    default: // linux
      return join(home, '.config/Cursor/User/workspaceStorage');
  }
}

export const config = {
  // Indexer settings
  indexerIntervalMs: 60_000, // 1 minute
  maxOutputPreviewLength: 500,
  maxOutputLogLength: 50_000,

  // Search settings
  defaultSearchLimit: 20,
  defaultHistoryLimit: 50,

  // Script extensions and their runners
  scriptRunners: {
    '.sh': ['bash'],
    '.ts': ['tsx'],
    '.mjs': ['node'],
    '.js': ['node'],
  } as Record<string, string[]>,

  // Chat import settings
  chatImport: {
    // Enable auto-import in indexer daemon
    enabled: true,
    // Import interval in milliseconds (default: 5 minutes)
    intervalMs: 5 * 60_000,
    // Maximum message length to store (truncate longer messages)
    maxMessageLength: 10_000,
    // Enable tool call extraction from chat sessions
    extractToolCalls: true,
    // Create separate events for tool calls
    toolCallsAsEvents: true,
    // Maximum tool output length to store (truncate longer outputs)
    maxToolOutputLength: 10_000,
    // Source-specific storage paths
    sources: {
      copilot: getVSCodeWorkspaceStorage,
      cursor: getCursorWorkspaceStorage,
    },
  },
} as const;

/**
 * Default configuration values
 */
export const defaultConfig = {
  indexer: {
    syncInterval: 60000,
    maxFileSize: 1_048_576,
    maxContentStore: 102_400,
    maxEmbedSize: 10_240,
  },
  embeddings: {
    enabled: true,
    model: 'ollama/all-minilm',
  },
  ai: {
    model: 'ollama/llama3',
  },
  chatImport: {
    enabled: true,
    intervalMs: 5 * 60_000,
    extractToolCalls: true,
    toolCallsAsEvents: true,
    maxToolOutputLength: 10_000,
  },
  search: {
    defaultMode: 'hybrid' as 'fts' | 'vector' | 'hybrid',
    hybridWeights: {
      fts: 0.5,
      vector: 0.5,
    },
  },
};

type DefaultConfig = typeof defaultConfig;

/**
 * User config file schema
 */
export interface UserConfig {
  indexer?: {
    syncInterval?: number;
    maxFileSize?: number;
    maxContentStore?: number;
    maxEmbedSize?: number;
  };
  embeddings?: {
    enabled?: boolean;
    model?: string;
  };
  ai?: {
    model?: string;
  };
  chatImport?: {
    enabled?: boolean;
    intervalMs?: number;
    extractToolCalls?: boolean;
    toolCallsAsEvents?: boolean;
    maxToolOutputLength?: number;
  };
  search?: {
    defaultMode?: 'fts' | 'vector' | 'hybrid';
    hybridWeights?: {
      fts?: number;
      vector?: number;
    };
  };
  daemon?: {
    discord?: {
      enabled?: boolean;
      token?: string;
      applicationId?: string;
      publicKey?: string;
      triggers?: Array<'dm' | 'mention' | { prefix: string }>;
    };
    agent?: {
      type?: 'cursor';
      defaultRepository?: string;
      timeoutMinutes?: number;
      maxConcurrentSessions?: number;
    };
    progress?: {
      updateIntervalMs?: number;
      theme?: 'dark' | 'light';
    };
  };
}

/**
 * Load user config from config.yaml
 */
export function loadUserConfig(): DefaultConfig {
  try {
    const content = readFileSync(paths.configFile, 'utf-8');
    const parsed = load(content) as UserConfig;
    const expanded = expandEnvVars(parsed) as UserConfig;
    return merge({}, defaultConfig, expanded);
  } catch (error) {
    console.warn(`Failed to parse config: ${error}`);
    return defaultConfig;
  }
}

/**
 * Recursively expand ${VAR} patterns with environment variable values
 */
function expandEnvVars(obj: unknown): unknown {
  return cloneDeepWith(obj, (value) =>
    typeof value === 'string'
      ? value.replace(/\$\{(\w+)\}/g, (_, name) => process.env[name] || '')
      : undefined,
  );
}
