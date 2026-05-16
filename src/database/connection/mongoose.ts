import mongoose from 'mongoose';
import { env } from '../../config/env';
import { logger } from '../../config/logger';

let listenersRegistered = false;

function registerConnectionListeners(): void {
  if (listenersRegistered) return;
  listenersRegistered = true;

  mongoose.connection.on('connected', () => {
    logger.info('MongoDB: connessione stabilita');
  });

  mongoose.connection.on('error', (err) => {
    logger.error({ err }, 'MongoDB: errore di connessione');
  });

  mongoose.connection.on('disconnected', () => {
    logger.warn('MongoDB: connessione persa');
  });
}

function abortableSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error('abort'));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new Error('abort'));
      },
      { once: true },
    );
  });
}

/**
 * Tenta la connessione a MongoDB con retry automatico ogni `retryIntervalMs`
 * millisecondi finché non riesce o il segnale `signal` viene attivato.
 *
 * Registra i listener sulla connessione Mongoose una sola volta per garantire
 * osservabilità (connected, error, disconnected) senza duplicati tra i tentativi.
 *
 * Va invocata una sola volta all'avvio, prima che il server HTTP cominci ad
 * accettare richieste.
 */
export async function connectWithRetry(
  signal: AbortSignal,
  retryIntervalMs = env.DB_RETRY_INTERVAL_MS,
): Promise<void> {
  registerConnectionListeners();

  let attempt = 0;
  while (!signal.aborted) {
    attempt++;
    try {
      await mongoose.connect(env.MONGODB_URI, {
        serverSelectionTimeoutMS: 5000,
        connectTimeoutMS: 5000,
      });
      return;
    } catch (err) {
      if (signal.aborted) break;
      logger.warn(
        { err, attempt },
        `MongoDB: tentativo ${attempt} fallito, nuovo tentativo in ${retryIntervalMs / 1000}s`,
      );
      await mongoose.connection.close().catch(() => {});
      await abortableSleep(retryIntervalMs, signal).catch(() => {});
    }
  }

  throw new Error('Connessione a MongoDB interrotta dal segnale di shutdown');
}

/**
 * Stabilisce la connessione a MongoDB usando l'URI dichiarato in MONGODB_URI.
 * Solleva un errore se la connessione non si stabilisce entro il timeout.
 *
 * Per un avvio con retry automatico usare `connectWithRetry`.
 */
export async function connectToDatabase(): Promise<void> {
  registerConnectionListeners();
  await mongoose.connect(env.MONGODB_URI, {
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 5000,
  });
}

/**
 * Chiude la connessione a MongoDB in modo ordinato.
 *
 * Va invocata durante lo shutdown dell'applicazione (vedi src/server.ts)
 * per garantire che le operazioni in corso vengano completate e che le
 * connessioni vengano rilasciate sul lato server del database.
 */
export async function disconnectFromDatabase(): Promise<void> {
  await mongoose.connection.close();
  logger.info('MongoDB: connessione chiusa');
}

/**
 * Ritorna lo stato corrente della connessione a MongoDB.
 *
 * Utile per esporre informazioni di health check senza dipendere
 * direttamente dall'API di Mongoose nei controller.
 */
export function getDatabaseStatus(): 'connected' | 'connecting' | 'disconnected' | 'disconnecting' {
  const states: Record<number, 'connected' | 'connecting' | 'disconnected' | 'disconnecting'> = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting',
  };
  return states[mongoose.connection.readyState] ?? 'disconnected';
}
