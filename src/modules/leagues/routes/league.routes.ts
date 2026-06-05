import { Router } from 'express';
import { authenticate, requireRole } from '../../../middleware/auth.middleware';
import { UserRole } from '../../../database/models/User.model';
import { getLeagueCurrentHandler, getLeagueHistoryHandler } from '../controllers/league.controller';

export function createLeagueRouter(): Router {
  const router = Router();

  router.get(
    '/leagues/current',
    authenticate,
    requireRole(UserRole.PLAYER),
    getLeagueCurrentHandler,
  );
  router.get(
    '/leagues/history',
    authenticate,
    requireRole(UserRole.PLAYER),
    getLeagueHistoryHandler,
  );

  return router;
}
