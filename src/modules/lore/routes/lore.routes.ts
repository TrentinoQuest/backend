import { Router } from 'express';
import { authenticate, requireRole } from '../../../middleware/auth.middleware';
import { UserRole } from '../../../database/models/User.model';
import {
  getDailyQuestionHandler,
  answerDailyQuestionHandler,
} from '../controllers/lore.controller';

export function createLoreRouter(): Router {
  const router = Router();

  router.get(
    '/lore/daily-question',
    authenticate,
    requireRole(UserRole.PLAYER),
    getDailyQuestionHandler,
  );
  router.post(
    '/lore/answer',
    authenticate,
    requireRole(UserRole.PLAYER),
    answerDailyQuestionHandler,
  );

  return router;
}
