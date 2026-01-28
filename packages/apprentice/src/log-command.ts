import { existsSync, mkdirSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { uuidv7 } from 'uuidv7';

/**
 * Log entry format - uses nested metadata structure
 * This matches the Event format expected by the indexer
 */
interface LogEntry {
  id: string;
  timestamp: string;
  message: string;
  metadata: {
    shell: {
      cwd: string;
      exit_code: number;
      output_preview?: string;
    };
    git: {
      branch: string;
      sha?: string;
    };
    source: string;
    tags?: string[];
  };
}

const LOG_DIR =
  process.env['APPRENTICE_LOG_DIR'] ??
  join(homedir(), '.apprentice', 'memory', 'logs');
const LOG_FILE = join(LOG_DIR, 'bash.log');
const OUTPUT_PREVIEW_LENGTH = 500;

/**
 * Auto-detect tags from a command
 */
function detectTags(command: string): string[] {
  const tags: string[] = [];
  const cmd = command.toLowerCase();

  const tagPatterns: [RegExp, string][] = [
    [/^git\s/, 'git'],
    [/^kubectl\s/, 'kubectl'],
    [/^docker\s/, 'docker'],
    [/^npm\s/, 'npm'],
    [/^yarn\s/, 'yarn'],
    [/^pnpm\s/, 'pnpm'],
    [/^brew\s/, 'brew'],
    [/^cargo\s/, 'cargo'],
    [/^python3?\s/, 'python'],
    [/^pip3?\s/, 'pip'],
    [/^node\s/, 'node'],
    [/^tsx?\s/, 'tsx'],
    [/^aws\s/, 'aws'],
    [/^gcloud\s/, 'gcloud'],
    [/^terraform\s/, 'terraform'],
    [/^ssh\s/, 'ssh'],
    [/^curl\s/, 'curl'],
    [/^wget\s/, 'wget'],
    [/^make\s/, 'make'],
    [/^cd\s/, 'navigation'],
    [/^ls\s/, 'navigation'],
    [/^cat\s/, 'files'],
    [/^grep\s/, 'search'],
    [/^find\s/, 'search'],
    [/^sed\s/, 'text'],
    [/^awk\s/, 'text'],
  ];

  for (const [pattern, tag] of tagPatterns) {
    if (pattern.test(cmd)) {
      tags.push(tag);
    }
  }

  return tags;
}

function ensureLogDir(): void {
  if (!existsSync(LOG_DIR)) {
    mkdirSync(LOG_DIR, { recursive: true });
  }
}

function logCommand(
  command: string,
  cwd: string,
  gitBranch: string,
  gitSha: string,
  exitCode: number,
  output: string,
): void {
  ensureLogDir();

  const timestamp = new Date().toISOString();
  const tags = detectTags(command);

  // Create output preview (truncated)
  const outputPreview = output.slice(0, OUTPUT_PREVIEW_LENGTH);

  // Build the event entry with nested metadata structure
  const entry: LogEntry = {
    id: uuidv7(),
    timestamp,
    message: command,
    metadata: {
      shell: {
        cwd,
        exit_code: exitCode,
        ...(outputPreview && { output_preview: outputPreview }),
      },
      git: {
        branch: gitBranch,
        ...(gitSha && { sha: gitSha }),
      },
      source: 'shell',
      ...(tags.length > 0 && { tags }),
    },
  };

  appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n');
}

async function readStdin(): Promise<string> {
  // When stdin is from /dev/null or TTY, return empty immediately
  // This prevents any terminal state interference
  if (process.stdin.isTTY || !process.stdin.readable) {
    return '';
  }

  const chunks: Buffer[] = [];

  return new Promise((resolve) => {
    // Set a short timeout to avoid hanging
    const timeout = setTimeout(() => resolve(''), 100);

    process.stdin.on('data', (chunk) => {
      chunks.push(chunk);
    });

    process.stdin.on('end', () => {
      clearTimeout(timeout);
      resolve(Buffer.concat(chunks).toString('utf-8'));
    });

    process.stdin.on('error', () => {
      clearTimeout(timeout);
      resolve('');
    });
  });
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length < 5) {
    console.error(
      'Usage: log-command.ts <command> <cwd> <git_branch> <git_sha> <exit_code>',
    );
    console.error('Output is read from stdin');
    process.exit(1);
  }

  const [command, cwd, gitBranch, gitSha, exitCodeStr] = args;
  const exitCode = parseInt(exitCodeStr!, 10);

  if (isNaN(exitCode)) {
    console.error('Exit code must be a number');
    process.exit(1);
  }

  const output = await readStdin();

  logCommand(command!, cwd!, gitBranch!, gitSha!, exitCode, output);
}

main().catch((err) => {
  console.error('Error logging command:', err);
  process.exit(1);
});
