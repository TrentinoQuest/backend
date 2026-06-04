import { Router } from 'express';
import { authenticate, requireRole } from '../../../middleware/auth.middleware';
import { UserRole } from '../../../database/models/User.model';
import {
  getSummaryHandler,
  getCompletionsOverTimeHandler,
  getTopQuestsHandler,
  getNeverCompletedQuestsHandler,
  getCompletionsHeatmapHandler,
  getLeaderboardHandler,
} from '../controllers/analytics.controller';

/**
 * Crea il router del modulo analytics.
 *
 * Implementa l'interfaccia IAnalytics del Deliverable D2: dashboard
 * amministrativa con flussi turistici, zone visitate/ignorate,
 * stagionalita' (RF39). Tutti gli endpoint sono riservati al ruolo admin.
 */
export function createAnalyticsRouter(): Router {
  const router = Router();

  router.get(
    '/admin/analytics/summary',
    authenticate,
    requireRole(UserRole.ADMIN),
    getSummaryHandler,
  );

  router.get(
    '/admin/analytics/completions-over-time',
    authenticate,
    requireRole(UserRole.ADMIN),
    getCompletionsOverTimeHandler,
  );

  router.get(
    '/admin/analytics/top-quests',
    authenticate,
    requireRole(UserRole.ADMIN),
    getTopQuestsHandler,
  );

  router.get(
    '/admin/analytics/never-completed-quests',
    authenticate,
    requireRole(UserRole.ADMIN),
    getNeverCompletedQuestsHandler,
  );

  router.get(
    '/admin/analytics/completions-heatmap',
    authenticate,
    requireRole(UserRole.ADMIN),
    getCompletionsHeatmapHandler,
  );

  router.get(
    '/admin/analytics/leaderboard',
    authenticate,
    requireRole(UserRole.ADMIN),
    getLeaderboardHandler,
  );

  return router;
}
