import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { requestLogger } from './middleware/request-logger';
import { errorHandler } from './middleware/error-handler';
import { createSwaggerRouter } from './middleware/swagger';
import { createOpenApiValidator } from './middleware/openapi-validator';
import { createAuthRouter } from './modules/auth/routes/auth.routes';
import { createQuestsRouter } from './modules/quests/routes/quests.routes';
import { createBusinessRouter } from './modules/business/routes/business.routes';
import { createAnalyticsRouter } from './modules/analytics/routes/analytics.routes';
import { createLoreRouter } from './modules/lore/routes/lore.routes';
import { createLeagueRouter } from './modules/leagues/routes/league.routes';
import { createSocialRouter } from './modules/social/routes/social.routes';
import { createCoopRouter } from './modules/coop/routes/coop.routes';
import { createMarketRouter } from './modules/market/routes/market.routes';
import { getDatabaseStatus } from './database/connection/mongoose';

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(requestLogger);

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

app.use('/api/v1', createSwaggerRouter());
app.use(createOpenApiValidator());
app.use('/api/v1/auth', createAuthRouter());
app.use('/api/v1', createQuestsRouter());
app.use('/api/v1', createBusinessRouter());
app.use('/api/v1', createAnalyticsRouter());
app.use('/api/v1', createLoreRouter());
app.use('/api/v1', createLeagueRouter());
app.use('/api/v1', createSocialRouter());
app.use('/api/v1', createCoopRouter());
app.use('/api/v1', createMarketRouter());
app.use(errorHandler);

export { app };
