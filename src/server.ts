import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env';
import { logger } from './config/logger';
import { requestLogger } from './middleware/request-logger';
import { errorHandler } from './middleware/error-handler';

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
 * che il servizio sia in esecuzione e responsivo.
 */
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'trentino-quest-backend',
    timestamp: new Date().toISOString(),
  });
});

// Le route dei moduli applicativi vengono registrate qui.
// app.use('/api/v1/auth', authRoutes);
// app.use('/api/v1', questsRoutes);

// L'error handler globale deve essere registrato come ultimo middleware,
// dopo tutte le route, per intercettare gli errori propagati da next(err).
app.use(errorHandler);

app.listen(env.PORT, () => {
  logger.info(`Trentino Quest backend listening on port ${env.PORT} (${env.NODE_ENV})`);
});
