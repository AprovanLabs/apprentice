import chalk from 'chalk';

export interface FormatOptions {
  maxLength?: number;
  truncateSuffix?: string;
}

const DEFAULT_MAX_LENGTH = 10240; // 10KB
const DEFAULT_TRUNCATE_SUFFIX = '\n... (output truncated)';

export function truncateOutput(
  output: string,
  options: FormatOptions = {},
): string {
  const maxLength = options.maxLength ?? DEFAULT_MAX_LENGTH;
  const suffix = options.truncateSuffix ?? DEFAULT_TRUNCATE_SUFFIX;

  if (output.length <= maxLength) {
    return output;
  }

  const truncateAt = maxLength - suffix.length;
  return output.slice(0, truncateAt) + suffix;
}

export function estimateSize(data: unknown): number {
  if (typeof data === 'string') {
    return data.length;
  }
  return JSON.stringify(data).length;
}
