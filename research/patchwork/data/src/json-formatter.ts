import chalk from 'chalk';
import { truncateOutput, FormatOptions } from './truncation.js';

interface JsonFormatOptions extends FormatOptions {
  indent?: number;
  colors?: {
    key?: typeof chalk;
    string?: typeof chalk;
    number?: typeof chalk;
    boolean?: typeof chalk;
    null?: typeof chalk;
    bracket?: typeof chalk;
  };
}

const DEFAULT_COLORS = {
  key: chalk.cyan,
  string: chalk.green,
  number: chalk.yellow,
  boolean: chalk.magenta,
  null: chalk.gray,
  bracket: chalk.white,
};

export function formatJson(
  data: unknown,
  options: JsonFormatOptions = {},
): string {
  const indent = options.indent ?? 2;
  const colors = { ...DEFAULT_COLORS, ...options.colors };

  const json = JSON.stringify(data, null, indent);
  const highlighted = highlightJson(json, colors);

  return truncateOutput(highlighted, options);
}

function highlightJson(
  json: string,
  colors: Required<JsonFormatOptions>['colors'],
): string {
  return json
    .replace(/"([^"]+)":/g, (_, key) => `${colors.key(`"${key}"`)}:`)
    .replace(/: "([^"]*)"/g, (_, str) => `: ${colors.string(`"${str}"`)}`)
    .replace(/: (-?\d+\.?\d*)/g, (_, num) => `: ${colors.number(num)}`)
    .replace(/: (true|false)/g, (_, bool) => `: ${colors.boolean(bool)}`)
    .replace(/: null/g, `: ${colors.null('null')}`)
    .replace(/([{}\[\],])/g, (bracket) => colors.bracket(bracket));
}

export function formatJsonCompact(data: unknown): string {
  return chalk.gray(JSON.stringify(data));
}
