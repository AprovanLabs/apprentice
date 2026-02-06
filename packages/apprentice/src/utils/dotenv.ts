/**
 * Dotenv - Load environment variables from .env files
 *
 * Adapted from dotenv by motdotla
 * @see https://github.com/motdotla/dotenv/blob/master/lib/main.js
 * @license BSD-2-Clause
 *
 * @example
 * // Basic usage - loads from .env in current directory
 * import { config } from './dotenv';
 * config();
 *
 * @example
 * // Custom path
 * config({ path: '/custom/path/.env' });
 *
 * @example
 * // Multiple files (loaded in order, later values don't override)
 * config({ path: ['.env.local', '.env'] });
 *
 * @example
 * // Override existing env vars
 * config({ override: true });
 *
 * @example
 * // Encrypted vault (requires DOTENV_KEY env var)
 * // Automatically loads from .env.vault when DOTENV_KEY is set
 * config();
 *
 * @example
 * // Parse a string directly
 * import { parse } from './dotenv';
 * const env = parse('FOO=bar\nBAZ=qux');
 * // => { FOO: 'bar', BAZ: 'qux' }
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

type EnvRecord = Record<string, string>;
type ProcessEnv = NodeJS.ProcessEnv | EnvRecord;

interface DotenvError extends Error {
  code: string;
}

interface DotenvOptions {
  path?: string | string[];
  encoding?: BufferEncoding;
  debug?: boolean;
  quiet?: boolean;
  override?: boolean;
  processEnv?: ProcessEnv;
  DOTENV_KEY?: string;
}

interface DotenvResult {
  parsed: EnvRecord;
  error?: Error;
}

const createError = (message: string, code: string): DotenvError => {
  const err = new Error(message) as DotenvError;
  err.code = code;
  return err;
};

const parseBoolean = (value: unknown): boolean =>
  typeof value === 'string'
    ? !['false', '0', 'no', 'off', ''].includes(value.toLowerCase())
    : Boolean(value);

const supportsAnsi = (): boolean => process.stdout.isTTY;

const dim = (text: string): string =>
  supportsAnsi() ? `\x1b[2m${text}\x1b[0m` : text;

const log = (msg: string): void => console.log(`[dotenv] ${msg}`);
const debug = (msg: string): void => console.debug(`[dotenv:debug] ${msg}`);
const warn = (msg: string): void => console.warn(`[dotenv:warn] ${msg}`);

const resolveHome = (envPath: string): string =>
  envPath.startsWith('~') ? path.join(os.homedir(), envPath.slice(1)) : envPath;

const LINE_REGEX =
  /(?:^|^)\s*(?:export\s+)?([\w.-]+)(?:\s*=\s*?|:\s+?)(\s*'(?:\\'|[^'])*'|\s*"(?:\\"|[^"])*"|\s*`(?:\\`|[^`])*`|[^#\r\n]+)?\s*(?:#.*)?(?:$|$)/gm;

const parse = (src: string | Buffer): EnvRecord => {
  const lines = src.toString().replace(/\r\n?/gm, '\n');
  const result: EnvRecord = {};
  let match: RegExpExecArray | null;

  while ((match = LINE_REGEX.exec(lines)) !== null) {
    const key = match[1];
    if (!key) continue;

    let value = (match[2] ?? '').trim();
    const quote = value[0];

    // Remove surrounding quotes
    value = value.replace(/^(['"`])([\s\S]*)\1$/gm, '$2');

    // Expand escape sequences for double-quoted strings
    if (quote === '"') {
      value = value.replace(/\\n/g, '\n').replace(/\\r/g, '\r');
    }

    result[key] = value;
  }

  return result;
};

const decrypt = (encrypted: string, keyStr: string): string => {
  const key = Buffer.from(keyStr.slice(-64), 'hex');
  const cipherBuffer = Buffer.from(encrypted, 'base64');

  const nonce = cipherBuffer.subarray(0, 12);
  const authTag = cipherBuffer.subarray(-16);
  const ciphertext = cipherBuffer.subarray(12, -16);

  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, nonce);
    decipher.setAuthTag(authTag);
    return decipher.update(ciphertext).toString() + decipher.final().toString();
  } catch (error) {
    const err = error as Error;
    const isRange = error instanceof RangeError;
    const invalidKeyLength = err.message === 'Invalid key length';
    const decryptionFailed =
      err.message === 'Unsupported state or unable to authenticate data';

    if (isRange || invalidKeyLength) {
      throw createError(
        'INVALID_DOTENV_KEY: It must be 64 characters long (or more)',
        'INVALID_DOTENV_KEY',
      );
    }
    if (decryptionFailed) {
      throw createError(
        'DECRYPTION_FAILED: Please check your DOTENV_KEY',
        'DECRYPTION_FAILED',
      );
    }
    throw error;
  }
};

const populate = (
  target: ProcessEnv,
  source: EnvRecord,
  options: Pick<DotenvOptions, 'debug' | 'override'> = {},
): EnvRecord => {
  const { debug: showDebug = false, override = false } = options;
  const populated: EnvRecord = {};

  if (typeof source !== 'object' || source === null) {
    throw createError(
      'OBJECT_REQUIRED: Please check the argument being passed to populate',
      'OBJECT_REQUIRED',
    );
  }

  for (const [key, value] of Object.entries(source)) {
    const exists = Object.prototype.hasOwnProperty.call(target, key);

    if (exists && !override) {
      if (showDebug) debug(`"${key}" already defined, not overwritten`);
      continue;
    }

    if (exists && showDebug) {
      debug(`"${key}" already defined, overwritten`);
    }

    target[key] = value;
    populated[key] = value;
  }

  return populated;
};

const getDotenvKey = (options?: DotenvOptions): string =>
  options?.DOTENV_KEY || process.env.DOTENV_KEY || '';

const findVaultPath = (options?: DotenvOptions): string | null => {
  const toVaultPath = (p: string): string =>
    p.endsWith('.vault') ? p : `${p}.vault`;

  if (options?.path) {
    const paths = Array.isArray(options.path) ? options.path : [options.path];
    const found = paths.find((p) => fs.existsSync(p));
    if (found) {
      const vaultPath = toVaultPath(found);
      return fs.existsSync(vaultPath) ? vaultPath : null;
    }
  }

  const defaultPath = path.resolve(process.cwd(), '.env.vault');
  return fs.existsSync(defaultPath) ? defaultPath : null;
};

const parseVaultKey = (
  dotenvKey: string,
  parsed: EnvRecord,
): { ciphertext: string; key: string } => {
  let uri: URL;
  try {
    uri = new URL(dotenvKey);
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === 'ERR_INVALID_URL') {
      throw createError(
        'INVALID_DOTENV_KEY: Wrong format. Must be valid URI like dotenv://:key_1234@dotenvx.com/vault/.env.vault?environment=development',
        'INVALID_DOTENV_KEY',
      );
    }
    throw error;
  }

  const key = uri.password;
  if (!key) {
    throw createError(
      'INVALID_DOTENV_KEY: Missing key part',
      'INVALID_DOTENV_KEY',
    );
  }

  const environment = uri.searchParams.get('environment');
  if (!environment) {
    throw createError(
      'INVALID_DOTENV_KEY: Missing environment part',
      'INVALID_DOTENV_KEY',
    );
  }

  const envKey = `DOTENV_VAULT_${environment.toUpperCase()}`;
  const ciphertext = parsed[envKey];
  if (!ciphertext) {
    throw createError(
      `NOT_FOUND_DOTENV_ENVIRONMENT: Cannot locate ${envKey} in .env.vault`,
      'NOT_FOUND_DOTENV_ENVIRONMENT',
    );
  }

  return { ciphertext, key };
};

const parseVault = (options: DotenvOptions): EnvRecord => {
  const vaultPath = findVaultPath(options);
  const vaultResult = configDotenv({
    ...options,
    path: vaultPath ?? undefined,
  });

  if (!vaultResult.parsed || Object.keys(vaultResult.parsed).length === 0) {
    throw createError(
      `MISSING_DATA: Cannot parse ${vaultPath} for an unknown reason`,
      'MISSING_DATA',
    );
  }

  const keys = getDotenvKey(options).split(',');
  let lastError: Error | null = null;

  for (const rawKey of keys) {
    try {
      const { ciphertext, key } = parseVaultKey(
        rawKey.trim(),
        vaultResult.parsed,
      );
      return parse(decrypt(ciphertext, key));
    } catch (error) {
      lastError = error as Error;
    }
  }

  throw lastError ?? createError('DECRYPTION_FAILED', 'DECRYPTION_FAILED');
};

const configVault = (options: DotenvOptions): DotenvResult => {
  const showDebug = parseBoolean(
    process.env.DOTENV_CONFIG_DEBUG ?? options.debug,
  );
  const quiet = parseBoolean(process.env.DOTENV_CONFIG_QUIET ?? options.quiet);

  if (showDebug || !quiet) {
    log('Loading env from encrypted .env.vault');
  }

  const parsed = parseVault(options);
  const target = options.processEnv ?? process.env;
  populate(target, parsed, options);

  return { parsed };
};

const configDotenv = (options?: DotenvOptions): DotenvResult => {
  const target = options?.processEnv ?? process.env;
  const encoding: BufferEncoding = options?.encoding ?? 'utf8';
  let showDebug = parseBoolean(
    target.DOTENV_CONFIG_DEBUG ?? options?.debug ?? false,
  );
  let quiet = parseBoolean(
    target.DOTENV_CONFIG_QUIET ?? options?.quiet ?? false,
  );

  const defaultPath = path.resolve(process.cwd(), '.env');
  const paths = options?.path
    ? (Array.isArray(options.path) ? options.path : [options.path]).map(
        resolveHome,
      )
    : [defaultPath];

  const parsedAll: EnvRecord = {};
  let lastError: Error | undefined;

  for (const filePath of paths) {
    try {
      const content = fs.readFileSync(filePath, { encoding });
      const parsed = parse(content);
      populate(parsedAll, parsed, options);
    } catch (e) {
      if (showDebug)
        debug(`Failed to load ${filePath}: ${(e as Error).message}`);
      lastError = e as Error;
    }
  }

  const populated = populate(target, parsedAll, options);

  // Re-check settings from loaded .env
  showDebug = parseBoolean(target.DOTENV_CONFIG_DEBUG ?? showDebug);
  quiet = parseBoolean(target.DOTENV_CONFIG_QUIET ?? quiet);

  if (showDebug || !quiet) {
    const count = Object.keys(populated).length;
    const shortPaths = paths
      .map((p) => {
        try {
          return path.relative(process.cwd(), p);
        } catch {
          return p;
        }
      })
      .join(', ');
    log(
      `injected ${count} env var(s) from ${shortPaths} ${dim(
        '-- tip: set DOTENV_CONFIG_QUIET=true to silence',
      )}`,
    );
  }

  return lastError
    ? { parsed: parsedAll, error: lastError }
    : { parsed: parsedAll };
};

/** Load environment variables from .env file(s) */
export const config = (options?: DotenvOptions): DotenvResult => {
  const dotenvKey = getDotenvKey(options);

  if (!dotenvKey) {
    return configDotenv(options);
  }

  const vaultPath = findVaultPath(options);
  if (!vaultPath) {
    warn(
      `DOTENV_KEY is set but .env.vault file not found. Did you forget to build it?`,
    );
    return configDotenv(options);
  }

  return configVault(options ?? {});
};

export { parse, populate, decrypt };
