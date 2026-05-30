import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env';
import { logger } from './config/logger';
import { requestLogger } from './middleware/request-logger';
import { errorHandler } from './middleware/error-handler';
import { createSwaggerRouter } from './middleware/swagger';
import { createOpenApiValidator } from './middleware/openapi-validator';
import { createAuthRouter } from './modules/auth/routes/auth.routes';
import { createQuestsRouter } from './modules/quests/routes/quests.routes';
import { createBusinessRouter } from './modules/business/routes/business.routes';
import { startRefreshTokenCleanupJob } from './jobs/refresh-token-cleanup.job';
import {
  connectWithRetry,
  disconnectFromDatabase,
  getDatabaseStatus,
} from './database/connection/mongoose';

const app = express();

// Middleware globali. L'ordine di registrazione è significativo:
// helmet e cors devono precedere il parser del body e le route applicative.
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(requestLogger);

/**
 * Health check endpoint.
 * Utilizzato da sistemi di monitoring e load balancer per verificare
 * che il servizio sia in esecuzione e responsivo. Espone anche lo stato
 * della connessione al database per facilitare la diagnosi di problemi
 * di infrastruttura.
 */
app.get('/health', (_req: Request, res: Response) => {
  const dbStatus = getDatabaseStatus();
  const isHealthy = dbStatus === 'connected';
  res.status(isHealthy ? 200 : 503).json({
    status: isHealthy ? 'ok' : 'degraded',
    service: 'trentino-quest-backend',
    timestamp: new Date().toISOString(),
    dependencies: {
      database: dbStatus,
    },
  });
});

// Documentazione OpenAPI: Swagger UI a /api/v1/docs e spec JSON a /api/v1/docs/openapi.json
app.use('/api/v1', createSwaggerRouter());

// Validazione automatica delle richieste contro lo schema OpenAPI.
// Deve essere registrata DOPO Swagger UI (per non validare le sue route)
// e PRIMA delle route applicative (per validarle tutte).
app.use(createOpenApiValidator());

// Route dei moduli applicativi.
app.use('/api/v1/auth', createAuthRouter());

// Le route del modulo quests sono tutte sotto /api/v1/quests, incluse quelle
app.use('/api/v1', createQuestsRouter());

// Le route del modulo business sono tutte sotto /api/v1/business, incluse quelle
app.use('/api/v1', createBusinessRouter());

// L'error handler globale deve essere registrato come ultimo middleware,
// dopo tutte le route, per intercettare gli errori propagati da next(err).
app.use(errorHandler);

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
