import { glob } from 'glob';
import { lstat } from 'node:fs/promises';
import type { Context } from '../types';

export interface DiscoveredFile {
  /** Key for the asset (may include mount prefix for mounted paths) */
  relativePath: string;
  absolutePath: string;
  /** Source path (main path or mounted path) this file came from */
  sourcePath: string;
}

async function discoverFilesInPath(
  basePath: string,
  includePatterns: string[],
  excludePatterns: string[],
  keyPrefix: string = '',
): Promise<DiscoveredFile[]> {
  const defaultExcludes = [
    '**/node_modules/**',
    '**/.git/**',
    '**/dist/**',
    '**/build/**',
    '**/*.log',
  ];

  const allExcludes = [...defaultExcludes, ...excludePatterns];
  const files: DiscoveredFile[] = [];

  for (const pattern of includePatterns) {
    const matches = await glob(pattern, {
      cwd: basePath,
      ignore: allExcludes,
      nodir: true,
      dot: false,
      follow: false,
      absolute: false,
    });

    for (const match of matches) {
      const absolutePath = `${basePath}/${match}`;

      // Skip symlinks that point to directories (avoid EISDIR errors)
      try {
        const stats = await lstat(absolutePath);
        if (stats.isSymbolicLink()) {
          // For symlinks, we need to check what they point to
          const { stat } = await import('node:fs/promises');
          try {
            const targetStats = await stat(absolutePath);
            if (targetStats.isDirectory()) {
              continue; // Skip symlinks to directories
            }
          } catch {
            continue; // Skip broken symlinks
          }
        }
      } catch {
        continue; // Skip files we can't stat
      }

      files.push({
        relativePath: keyPrefix ? `${keyPrefix}/${match}` : match,
        absolutePath,
        sourcePath: basePath,
      });
    }
  }

  return files;
}

export async function discoverFiles(
  context: Context,
): Promise<DiscoveredFile[]> {
  const includePatterns = context.include_patterns.length
    ? context.include_patterns
    : ['**/*'];
  const excludePatterns = context.exclude_patterns || [];

  // Discover files from main path (no prefix)
  const mainFiles = await discoverFilesInPath(
    context.path,
    includePatterns,
    excludePatterns,
  );

  // Discover files from mounted paths (with user-specified mount point as prefix)
  const mounts = context.mounts || [];
  const mountedFilesArrays = await Promise.all(
    mounts.map(({ path, mount }) =>
      discoverFilesInPath(path, includePatterns, excludePatterns, mount),
    ),
  );

  // Combine all files
  const allFiles = [...mainFiles, ...mountedFilesArrays.flat()];

  // Dedupe by relativePath (the key) - in case of overlapping paths
  const uniqueFiles = Array.from(
    new Map(allFiles.map((f) => [f.relativePath, f])).values(),
  );

  return uniqueFiles;
}
