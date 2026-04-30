import pino from 'pino';
import { env } from './env';

/**
 * Logger applicativo condiviso da tutti i moduli.
 *
 * In ambiente di sviluppo l'output viene formattato in modo leggibile
 * tramite pino-pretty (con colori e timestamp).
 * In ambiente di produzione l'output è JSON strutturato, adatto
 * all'aggregazione e al parsing automatico.
 */
export const logger = pino({
  level: env.LOG_LEVEL,
  transport:
    env.NODE_ENV === 'development'
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss.l',
            ignore: 'pid,hostname',
          },
        }
      : undefined,
});
