import { spawn } from 'node:child_process';
import { chmod, accessSync, constants } from 'node:fs';
import { dirname } from 'node:path';
import { promisify } from 'node:util';
import type { AssetId } from '../types';
import { getAsset, resolveAssetPath } from './retrieval';
import { getContext } from '../context';

const chmodAsync = promisify(chmod);

export interface ExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  duration: number;
}

export interface ExecuteAssetOptions {
  args?: string[];
  timeout?: number;
  cwd?: string;
  env?: Record<string, string>;
}

const DEFAULT_TIMEOUT = 30000; // 30 seconds

const EXECUTABLE_EXTENSIONS = ['.sh', '.bash', '.zsh', '.py', '.js', '.ts'];

export async function executeAsset(
  id: AssetId,
  options: ExecuteAssetOptions = {},
): Promise<ExecutionResult> {
  const asset = await getAsset(id);
  if (!asset) {
    throw new Error(`Asset '${id}' not found`);
  }

  if (!EXECUTABLE_EXTENSIONS.includes(asset.extension)) {
    throw new Error(
      `Asset '${id}' has non-executable extension '${asset.extension}'`,
    );
  }

  const context = await getContext(asset.context_id);
  if (!context) {
    throw new Error(
      `Context '${asset.context_id}' not found for asset '${id}'`,
    );
  }

  const absolutePath = resolveAssetPath(asset, context);

  try {
    accessSync(absolutePath, constants.R_OK);
  } catch {
    throw new Error(`Cannot read asset file at '${absolutePath}'`);
  }

  try {
    accessSync(absolutePath, constants.X_OK);
  } catch {
    try {
      await chmodAsync(absolutePath, 0o755);
    } catch (err) {
      throw new Error(
        `Asset '${id}' is not executable and cannot be made executable: ${err}`,
      );
    }
  }

  const startTime = Date.now();
  const timeout = options.timeout ?? DEFAULT_TIMEOUT;
  const args = options.args ?? [];
  // Default cwd to the directory containing the asset file
  const cwd = options.cwd ?? dirname(absolutePath);
  const env = { ...process.env, ...options.env };

  let command: string;
  let commandArgs: string[];

  switch (asset.extension) {
    case '.sh':
    case '.bash':
      command = 'bash';
      commandArgs = [absolutePath, ...args];
      break;
    case '.zsh':
      command = 'zsh';
      commandArgs = [absolutePath, ...args];
      break;
    case '.py':
      command = 'python3';
      commandArgs = [absolutePath, ...args];
      break;
    case '.js':
      command = 'node';
      commandArgs = [absolutePath, ...args];
      break;
    case '.ts':
      command = 'tsx';
      commandArgs = [absolutePath, ...args];
      break;
    default:
      throw new Error(`Unsupported executable extension '${asset.extension}'`);
  }

  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, {
      cwd,
      env,
      timeout,
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('error', (err) => {
      if (timedOut) return;
      reject(new Error(`Failed to execute asset '${id}': ${err.message}`));
    });

    child.on('close', (code) => {
      if (timedOut) return;

      const duration = Date.now() - startTime;
      resolve({
        stdout,
        stderr,
        exitCode: code ?? -1,
        duration,
      });
    });

    setTimeout(() => {
      if (child.exitCode === null) {
        timedOut = true;
        child.kill('SIGTERM');

        setTimeout(() => {
          if (child.exitCode === null) {
            child.kill('SIGKILL');
          }
        }, 1000);

        reject(
          new Error(`Asset '${id}' execution timed out after ${timeout}ms`),
        );
      }
    }, timeout);
  });
}

export function isExecutableAsset(extension: string): boolean {
  return EXECUTABLE_EXTENSIONS.includes(extension);
}

export function getExecutor(extension: string): string | null {
  switch (extension) {
    case '.sh':
    case '.bash':
      return 'bash';
    case '.zsh':
      return 'zsh';
    case '.py':
      return 'python3';
    case '.js':
      return 'node';
    case '.ts':
      return 'tsx';
    default:
      return null;
  }
}
