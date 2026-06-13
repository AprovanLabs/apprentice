export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  [key: string]: unknown;
}

interface LoggerOptions {
  namespace: string;
  level?: LogLevel;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const DEFAULT_LEVEL: LogLevel = process.env.NODE_ENV === 'production' ? 'info' : 'debug';

function shouldLog(currentLevel: LogLevel, messageLevel: LogLevel): boolean {
  return LOG_LEVELS[messageLevel] >= LOG_LEVELS[currentLevel];
}

function formatMessage(
  namespace: string,
  level: LogLevel,
  message: string,
  context?: LogContext,
): string {
  const timestamp = new Date().toISOString();
  const contextStr = context ? ` ${JSON.stringify(context)}` : '';
  return `[${timestamp}] [${level.toUpperCase()}] [${namespace}] ${message}${contextStr}`;
}

export interface Logger {
  readonly namespace: string;
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
}

export function createLogger(options: LoggerOptions): Logger {
  const namespace = options.namespace;
  const level = options.level ?? DEFAULT_LEVEL;

  const log = (messageLevel: LogLevel, message: string, context?: LogContext) => {
    if (!shouldLog(level, messageLevel)) return;

    const formatted = formatMessage(namespace, messageLevel, message, context);

    switch (messageLevel) {
      case 'debug':
        console.debug(formatted);
        break;
      case 'info':
        console.log(formatted);
        break;
      case 'warn':
        console.warn(formatted);
        break;
      case 'error':
        console.error(formatted);
        break;
    }
  };

  return {
    namespace,
    debug: (message, context) => log('debug', message, context),
    info: (message, context) => log('info', message, context),
    warn: (message, context) => log('warn', message, context),
    error: (message, context) => log('error', message, context),
  };
}

export const logger = createLogger({ namespace: 'app' });

export function createChildLogger(parentLogger: Logger, childNamespace: string): Logger {
  return createLogger({
    namespace: `${parentLogger.namespace}:${childNamespace}`,
    level: DEFAULT_LEVEL,
  });
}
