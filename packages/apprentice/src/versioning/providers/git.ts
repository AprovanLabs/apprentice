import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import type {
  VersionProvider,
  VersionProviderConfig,
  VersionRef,
  VersionDiff,
  FileChange,
  ListRefsOptions,
  FileChangeStatus,
} from '../types';

const execFileAsync = promisify(execFile);

function parseGitStatus(status: string): FileChangeStatus {
  switch (status) {
    case 'A':
      return 'added';
    case 'D':
      return 'deleted';
    case 'M':
      return 'modified';
    case 'R':
      return 'renamed';
    default:
      return 'modified';
  }
}

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', args, {
    cwd,
    maxBuffer: 10 * 1024 * 1024,
  });
  return stdout.trim();
}

export function createGitProvider(
  config: VersionProviderConfig,
): VersionProvider {
  const maxDepth = config.maxDepth ?? 100;
  const includeTags = config.includeTags ?? false;

  return {
    type: 'git',

    async detect(contextPath: string): Promise<boolean> {
      try {
        await git(contextPath, ['rev-parse', '--git-dir']);
        return true;
      } catch {
        return false;
      }
    },

    async getCurrentRef(contextPath: string): Promise<VersionRef | null> {
      try {
        const sha = await git(contextPath, ['rev-parse', 'HEAD']);
        return this.getRef(contextPath, sha);
      } catch {
        return null;
      }
    },

    async getRef(
      contextPath: string,
      refId: string,
    ): Promise<VersionRef | null> {
      try {
        const format = '%H%n%P%n%aI%n%s';
        const output = await git(contextPath, [
          'log',
          '-1',
          `--format=${format}`,
          refId,
        ]);
        const [sha, parents, timestamp, message] = output.split('\n');

        let name = sha!;
        try {
          name = await git(contextPath, [
            'describe',
            '--tags',
            '--exact-match',
            sha!,
          ]);
        } catch {
          try {
            const branch = await git(contextPath, [
              'branch',
              '--contains',
              sha!,
              '--format=%(refname:short)',
            ]);
            if (branch) name = branch.split('\n')[0]!;
          } catch {
            // Branch lookup may fail for detached HEAD
          }
        }

        return {
          id: sha!,
          refType: 'commit',
          name,
          parentIds: parents ? parents.split(' ').filter(Boolean) : [],
          timestamp: timestamp!,
          message,
          metadata: {},
        };
      } catch {
        return null;
      }
    },

    async listRefs(
      contextPath: string,
      options?: ListRefsOptions,
    ): Promise<VersionRef[]> {
      const refs: VersionRef[] = [];
      const limit = options?.limit ?? maxDepth;
      const since = options?.since;
      const branch = options?.branch;

      const args = ['log', `--format=%H|%P|%aI|%s`, `-n${limit}`];
      if (since) args.push(`--since=${since}`);
      if (branch) {
        args.push(branch);
      } else {
        args.push('HEAD');
      }

      try {
        const output = await git(contextPath, args);
        for (const line of output.split('\n').filter(Boolean)) {
          const [sha, parents, timestamp, message] = line.split('|');
          refs.push({
            id: sha!,
            refType: 'commit',
            name: sha!.substring(0, 7),
            parentIds: parents ? parents.split(' ').filter(Boolean) : [],
            timestamp: timestamp!,
            message,
            metadata: {},
          });
        }
      } catch {
        // Log parsing may fail for some commits
      }

      if (includeTags) {
        try {
          const tagsOutput = await git(contextPath, [
            'tag',
            '-l',
            '--format=%(refname:short)|%(objectname)|%(*objectname)|%(creatordate:iso-strict)',
          ]);
          for (const line of tagsOutput.split('\n').filter(Boolean)) {
            const [name, tagSha, pointedSha, timestamp] = line.split('|');
            refs.push({
              id: pointedSha || tagSha!,
              refType: 'tag',
              name: name!,
              parentIds: [],
              timestamp: timestamp!,
              metadata: {},
            });
          }
        } catch {
          // Tag parsing may fail
        }
      }

      return refs;
    },

    async getDiff(
      contextPath: string,
      fromRef: string | null,
      toRef: string,
    ): Promise<VersionDiff> {
      const ref = await this.getRef(contextPath, toRef);
      if (!ref) throw new Error(`Ref not found: ${toRef}`);

      const changes: FileChange[] = [];
      const args = fromRef
        ? ['diff', '--name-status', fromRef, toRef]
        : ['diff-tree', '--name-status', '-r', '--root', toRef];

      try {
        const output = await git(contextPath, args);
        for (const line of output.split('\n').filter(Boolean)) {
          const parts = line.split('\t');
          const status = parseGitStatus(parts[0]!.charAt(0));

          if (parts[0]!.startsWith('R')) {
            changes.push({
              key: parts[2]!,
              status: 'renamed',
              renamedFrom: parts[1],
            });
          } else {
            changes.push({
              key: parts[1]!,
              status,
            });
          }
        }
      } catch {
        // Diff parsing may fail
      }

      return { ref, changes };
    },

    async getContent(
      contextPath: string,
      key: string,
      refId: string,
    ): Promise<string | null> {
      try {
        return await git(contextPath, ['show', `${refId}:${key}`]);
      } catch {
        return null;
      }
    },

    async getContentHash(
      contextPath: string,
      key: string,
      refId: string,
    ): Promise<string | null> {
      const content = await this.getContent(contextPath, key, refId);
      if (!content) return null;
      return createHash('sha256').update(content).digest('hex');
    },

    async listFiles(contextPath: string, refId: string): Promise<string[]> {
      try {
        const output = await git(contextPath, [
          'ls-tree',
          '-r',
          '--name-only',
          refId,
        ]);
        return output.split('\n').filter(Boolean);
      } catch {
        return [];
      }
    },

    async canRetrieve(contextPath: string, refId: string): Promise<boolean> {
      try {
        await git(contextPath, ['cat-file', '-e', refId]);
        return true;
      } catch {
        return false;
      }
    },
  };
}
