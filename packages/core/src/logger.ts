import type { Writable } from 'node:stream';

import type { Logger } from '@varde/contracts';
import pino, {
  type DestinationStream,
  type Level,
  type LoggerOptions,
  type Logger as PinoLogger,
} from 'pino';

/**
 * Factory de `Logger` (contrat @varde/contracts) adossée à Pino.
 *
 * Le core utilise un logger racine créé au démarrage, et dérive des
 * sous-loggers scopés par module/guild/request via `child()`. La
 * rédaction des champs sensibles est déclarée à la création et héritée
 * par les enfants.
 */

/** Niveau d'un logger Pino (ordre croissant de gravité). */
export type LogLevel = Level;

/** Options de construction d'un logger. */
export interface CreateLoggerOptions {
  /** Niveau minimum loggué. Défaut : `info`. */
  readonly level?: LogLevel;
  /** Chemins JSON à rédacter (ex. `['*.token', 'user.email']`). */
  readonly redact?: readonly string[];
  /** Bindings de base appliqués à toutes les entrées. */
  readonly bindings?: Readonly<Record<string, unknown>>;
  /** Destination d'écriture (défaut : stdout). Pratique pour les tests. */
  readonly destination?: Writable | DestinationStream;
}

const REDACTED = '[REDACTED]';

const buildPinoOptions = (options: CreateLoggerOptions): LoggerOptions => {
  const pinoOptions: LoggerOptions = { level: options.level ?? 'info' };
  if (options.redact && options.redact.length > 0) {
    pinoOptions.redact = { paths: [...options.redact], censor: REDACTED };
  }
  if (options.bindings) {
    pinoOptions.base = { ...options.bindings };
  }
  return pinoOptions;
};

/**
 * Construit un `Logger` conforme au contrat. L'instance retournée est
 * immuable du point de vue de ses bindings ; pour enrichir, utiliser
 * `child()`.
 */
export function createLogger(options: CreateLoggerOptions = {}): Logger {
  const pinoOptions = buildPinoOptions(options);
  const pinoLogger = options.destination
    ? pino(pinoOptions, options.destination as DestinationStream)
    : pino(pinoOptions);
  return wrap(pinoLogger);
}

const mergeMeta = (
  error: Error | undefined,
  meta: Record<string, unknown> | undefined,
): Record<string, unknown> => {
  if (error === undefined) {
    return meta ? { ...meta } : {};
  }
  return { ...(meta ?? {}), err: error };
};

const wrap = (pinoLogger: PinoLogger): Logger => ({
  trace: (message, meta) => {
    pinoLogger.trace(meta ?? {}, message);
  },
  debug: (message, meta) => {
    pinoLogger.debug(meta ?? {}, message);
  },
  info: (message, meta) => {
    pinoLogger.info(meta ?? {}, message);
  },
  warn: (message, meta) => {
    pinoLogger.warn(meta ?? {}, message);
  },
  error: (message, error, meta) => {
    pinoLogger.error(mergeMeta(error, meta), message);
  },
  fatal: (message, error, meta) => {
    pinoLogger.fatal(mergeMeta(error, meta), message);
  },
  child: (bindings) => wrap(pinoLogger.child(bindings)),
});
