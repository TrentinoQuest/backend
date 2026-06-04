import { env } from './config/env';
import { logger } from './config/logger';
import { app } from './app';
import { startRefreshTokenCleanupJob } from './jobs/refresh-token-cleanup.job';
import { connectWithRetry, disconnectFromDatabase } from './database/connection/mongoose';

/**
 * Avvio dell'applicazione.
 *
 * Tenta la connessione al database con retry automatico (intervallo
 * configurabile via DB_RETRY_INTERVAL_MS) prima di avviare il server HTTP.
 * Il server non accetta richieste finché la prima connessione non è stabilita.
 *
 * Se viene ricevuto SIGINT o SIGTERM durante i tentativi, il processo
 * termina in modo ordinato senza lanciare il server.
 */
async function start(): Promise<void> {
  const abortController = new AbortController();

  const abortOnSignal = (signal: string) => (): void => {
    logger.info(`Ricevuto ${signal}, interruzione dei tentativi di connessione`);
    abortController.abort();
  };
  const onSigterm = abortOnSignal('SIGTERM');
  const onSigint = abortOnSignal('SIGINT');

  process.once('SIGTERM', onSigterm);
  process.once('SIGINT', onSigint);

  try {
    await connectWithRetry(abortController.signal);
  } catch (err) {
    if (abortController.signal.aborted) {
      logger.info('Shutdown richiesto durante la connessione al database, uscita ordinata');
      process.exit(0);
    }
    logger.fatal({ err }, 'Errore imprevisto durante la connessione al database');
    process.exit(1);
  }

  process.removeListener('SIGTERM', onSigterm);
  process.removeListener('SIGINT', onSigint);

  // Job periodico di cleanup dei refresh token scaduti o revocati da molto tempo.
  // Avviato dopo la connessione al DB per evitare errori sulla prima esecuzione.
  const stopCleanupJob = startRefreshTokenCleanupJob();

  const server = app.listen(env.PORT, () => {
    logger.info(`Trentino Quest backend listening on port ${env.PORT} (${env.NODE_ENV})`);
  });

  /**
   * Graceful shutdown.
   *
   * Alla ricezione di un segnale di terminazione, il server smette di
   * accettare nuove connessioni, attende il completamento delle richieste
   * in corso, chiude la connessione al database e termina il processo.
   * Il cleanup job viene fermato per primo per evitare esecuzioni durante
   * la chiusura.
   */
  const shutdown = (signal: string): void => {
    logger.info(`Ricevuto ${signal}, avvio shutdown ordinato`);
    stopCleanupJob();
    server.close((err) => {
      if (err) {
        logger.error({ err }, 'Errore durante la chiusura del server HTTP');
        process.exit(1);
      }
      disconnectFromDatabase()
        .then(() => {
          logger.info('Shutdown completato');
          process.exit(0);
        })
        .catch((disconnectErr: unknown) => {
          logger.error({ err: disconnectErr }, 'Errore durante la chiusura del database');
          process.exit(1);
        });
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

void start();
