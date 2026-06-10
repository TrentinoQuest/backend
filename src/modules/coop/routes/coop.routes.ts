import { Router } from 'express';
import { authenticate, requireRole } from '../../../middleware/auth.middleware';
import { UserRole } from '../../../database/models/User.model';
import {
  createCoopChallengeHandler,
  getActiveChallengesHandler,
  getChallengeByIdHandler,
  addProgressHandler,
  nudgePartnerHandler,
} from '../controllers/coop.controller';

export function createCoopRouter(): Router {
  const router = Router();

  router.post(
    '/coop/challenges',
    authenticate,
    requireRole(UserRole.PLAYER),
    createCoopChallengeHandler,
  );
  router.get(
    '/coop/challenges',
    authenticate,
    requireRole(UserRole.PLAYER),
    getActiveChallengesHandler,
  );
  router.get(
    '/coop/challenges/:id',
    authenticate,
    requireRole(UserRole.PLAYER),
    getChallengeByIdHandler,
  );
  router.post(
    '/coop/challenges/:id/progress',
    authenticate,
    requireRole(UserRole.PLAYER),
    addProgressHandler,
  );
  router.post(
    '/coop/nudge/:partnerId',
    authenticate,
    requireRole(UserRole.PLAYER),
    nudgePartnerHandler,
  );

  return router;
}
