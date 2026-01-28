import { statSync } from 'node:fs';

export interface ContentPolicyResult {
  stored: boolean;
  reason?: 'size_limit' | 'binary' | 'excluded';
}

export interface ContentPolicyConfig {
  maxSizeBytes: number;
  binaryExtensions: string[];
  excludePatterns: string[];
}

const DEFAULT_CONFIG: ContentPolicyConfig = {
  maxSizeBytes: 100 * 1024, // 100KB
  binaryExtensions: [
    '.exe',
    '.dll',
    '.so',
    '.dylib',
    '.a',
    '.o',
    '.bin',
    '.png',
    '.jpg',
    '.jpeg',
    '.gif',
    '.bmp',
    '.ico',
    '.webp',
    '.svg',
    '.pdf',
    '.zip',
    '.tar',
    '.gz',
    '.bz2',
    '.7z',
    '.rar',
    '.woff',
    '.woff2',
    '.ttf',
    '.eot',
    '.mp3',
    '.mp4',
    '.avi',
    '.mov',
    '.wav',
    '.flac',
    '.db',
    '.sqlite',
    '.sqlite3',
  ],
  excludePatterns: [
    'node_modules/**',
    '.git/**',
    'dist/**',
    'build/**',
    '*.log',
  ],
};

let globalConfig = DEFAULT_CONFIG;

export function setContentPolicyConfig(config: Partial<ContentPolicyConfig>) {
  globalConfig = { ...globalConfig, ...config };
}

export function getContentPolicyConfig(): ContentPolicyConfig {
  return { ...globalConfig };
}

export function getContentPolicy(
  filePath: string,
  extension: string,
  sizeBytes?: number,
): ContentPolicyResult {
  const config = globalConfig;

  for (const pattern of config.excludePatterns) {
    const regex = new RegExp(
      pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*'),
    );
    if (regex.test(filePath)) {
      return { stored: false, reason: 'excluded' };
    }
  }

  if (config.binaryExtensions.includes(extension.toLowerCase())) {
    return { stored: false, reason: 'binary' };
  }

  let actualSize = sizeBytes;
  if (actualSize === undefined) {
    try {
      const stats = statSync(filePath);
      actualSize = stats.size;
    } catch {
      return { stored: false, reason: 'excluded' };
    }
  }

  if (actualSize > config.maxSizeBytes) {
    return { stored: false, reason: 'size_limit' };
  }

  return { stored: true };
}

export function isBinaryExtension(extension: string): boolean {
  return globalConfig.binaryExtensions.includes(extension.toLowerCase());
}

export function shouldStoreContent(
  filePath: string,
  extension: string,
  sizeBytes?: number,
): boolean {
  return getContentPolicy(filePath, extension, sizeBytes).stored;
}
