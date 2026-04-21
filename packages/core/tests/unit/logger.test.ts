import { describe, expect, it } from 'vitest';

import { createLogger } from '../../src/logger.js';

type LogEntry = Readonly<Record<string, unknown>>;

const createCaptureStream = (): {
  readonly stream: { write: (chunk: string) => void };
  readonly entries: LogEntry[];
} => {
  const entries: LogEntry[] = [];
  return {
    entries,
    stream: {
      write: (chunk: string) => {
        for (const line of chunk.split('\n')) {
          if (line.length === 0) {
            continue;
          }
          entries.push(JSON.parse(line) as LogEntry);
        }
      },
    },
  };
};

describe('createLogger', () => {
  it('écrit un message info avec ses metadata', () => {
    const { stream, entries } = createCaptureStream();
    const logger = createLogger({ destination: stream });
    logger.info('hello', { requestId: 'r-1' });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ level: 30, msg: 'hello', requestId: 'r-1' });
  });

  it('filtre les niveaux en-dessous du seuil', () => {
    const { stream, entries } = createCaptureStream();
    const logger = createLogger({ level: 'warn', destination: stream });
    logger.info('ignored');
    logger.warn('kept');
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ level: 40, msg: 'kept' });
  });

  it('sérialise une Error sur error/fatal', () => {
    const { stream, entries } = createCaptureStream();
    const logger = createLogger({ destination: stream });
    const err = new Error('boom');
    logger.error('échec', err, { step: 'migrate' });
    expect(entries[0]).toMatchObject({
      level: 50,
      msg: 'échec',
      step: 'migrate',
      err: expect.objectContaining({ type: 'Error', message: 'boom' }),
    });
  });

  it('rédacte les chemins déclarés', () => {
    const { stream, entries } = createCaptureStream();
    const logger = createLogger({
      destination: stream,
      redact: ['session.token', '*.secret'],
    });
    logger.info('login', {
      session: { token: 'shhhh', userId: 'u-1' },
      payload: { secret: '42' },
    });
    expect(entries[0]).toMatchObject({
      session: { token: '[REDACTED]', userId: 'u-1' },
      payload: { secret: '[REDACTED]' },
    });
  });

  it('propage les bindings du parent vers les enfants', () => {
    const { stream, entries } = createCaptureStream();
    const logger = createLogger({ destination: stream, bindings: { service: 'core' } });
    const child = logger.child({ module: 'moderation' });
    child.info('started');
    expect(entries[0]).toMatchObject({ service: 'core', module: 'moderation', msg: 'started' });
  });
});
