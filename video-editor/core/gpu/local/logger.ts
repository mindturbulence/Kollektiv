// ponytail: freecut's createLogger is a structured wide-event logger with levels;
// the ported pipelines only call .warn()/.error() for GPU pipeline-creation
// failures, so a console-backed stub is enough here.
export interface Logger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

export function createLogger(prefix: string): Logger {
  return {
    debug: (message, ...args) => console.debug(`[${prefix}]`, message, ...args),
    info: (message, ...args) => console.info(`[${prefix}]`, message, ...args),
    warn: (message, ...args) => console.warn(`[${prefix}]`, message, ...args),
    error: (message, ...args) => console.error(`[${prefix}]`, message, ...args),
  };
}
