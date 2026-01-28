// Shell Backend - Executes local shell commands for widgets

import { spawn } from 'node:child_process';
import type { ServiceConfig, ServiceResult, ServiceBackend } from '../types.js';

const DEFAULT_TIMEOUT = 30000;

function normalizeArgs(args: unknown[]): string[] {
  if (args.length === 0) return [];
  if (args.length === 1 && Array.isArray(args[0])) return args[0].map(String);
  if (args.length === 1 && typeof args[0] === 'object' && args[0] !== null) {
    return Object.entries(args[0] as Record<string, unknown>).flatMap(
      ([k, v]) => {
        if (v === true) return [`--${k}`];
        if (v === false || v === undefined || v === null) return [];
        return [`--${k}`, String(v)];
      },
    );
  }
  return args.map(String);
}

export async function createShellBackend(
  name: string,
  config: ServiceConfig,
): Promise<ServiceBackend> {
  const cwd = config.cwd || process.cwd();

  return {
    name,

    async call(procedure: string, args: unknown[]): Promise<ServiceResult> {
      const startTime = performance.now();
      const cmdArgs = normalizeArgs(args);

      return new Promise((resolve) => {
        const proc = spawn(procedure, cmdArgs, {
          cwd,
          env: { ...process.env },
          shell: true,
        });

        let stdout = '';
        let stderr = '';
        let timedOut = false;

        const timeout = setTimeout(() => {
          timedOut = true;
          proc.kill('SIGTERM');
        }, DEFAULT_TIMEOUT);

        proc.stdout?.on('data', (data) => {
          stdout += data;
        });
        proc.stderr?.on('data', (data) => {
          stderr += data;
        });

        proc.on('error', (err) => {
          clearTimeout(timeout);
          resolve({
            success: false,
            error: `Failed to execute '${procedure}': ${err.message}`,
            durationMs: performance.now() - startTime,
          });
        });

        proc.on('close', (code) => {
          clearTimeout(timeout);

          if (timedOut) {
            resolve({
              success: false,
              error: `Command '${procedure}' timed out after ${DEFAULT_TIMEOUT}ms`,
              durationMs: performance.now() - startTime,
            });
            return;
          }

          if (code !== 0) {
            resolve({
              success: false,
              error: stderr.trim() || `Command exited with code ${code}`,
              data: {
                stdout: stdout.trim(),
                stderr: stderr.trim(),
                exitCode: code,
              },
              durationMs: performance.now() - startTime,
            });
            return;
          }

          resolve({
            success: true,
            data: { stdout: stdout.trim(), stderr: stderr.trim(), exitCode: 0 },
            durationMs: performance.now() - startTime,
          });
        });
      });
    },
  };
}
