import { Router } from 'express';
import { authenticate, requireRole } from '../../../middleware/auth.middleware';
import { UserRole } from '../../../database/models/User.model';
import {
  sendKudosHandler,
  getFeedHandler,
  getSuggestionsHandler,
  sendFriendRequestHandler,
  respondFriendRequestHandler,
} from '../controllers/social.controller';

export function createSocialRouter(): Router {
  const router = Router();

  router.post('/social/kudos', authenticate, requireRole(UserRole.PLAYER), sendKudosHandler);
  router.get('/social/feed', authenticate, requireRole(UserRole.PLAYER), getFeedHandler);
  router.get(
    '/social/suggestions',
    authenticate,
    requireRole(UserRole.PLAYER),
    getSuggestionsHandler,
  );
  router.post(
    '/social/friends/request',
    authenticate,
    requireRole(UserRole.PLAYER),
    sendFriendRequestHandler,
  );
  router.post(
    '/social/friends/respond',
    authenticate,
    requireRole(UserRole.PLAYER),
    respondFriendRequestHandler,
  );

  return router;
}
