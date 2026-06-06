import { Router } from 'express';
import { authenticate, requireRole } from '../../../middleware/auth.middleware';
import { UserRole } from '../../../database/models/User.model';
import {
  sendKudosHandler,
  getFeedHandler,
  getSocialLeaderboardHandler,
  sendFriendRequestHandler,
  getFriendsHandler,
  getPendingRequestsHandler,
  acceptFriendRequestHandler,
  rejectFriendRequestHandler,
  removeFriendHandler,
} from '../controllers/social.controller';

export function createSocialRouter(): Router {
  const router = Router();

  router.post('/social/kudos', authenticate, requireRole(UserRole.PLAYER), sendKudosHandler);
  router.get('/social/feed', authenticate, requireRole(UserRole.PLAYER), getFeedHandler);
  router.get(
    '/social/leaderboard',
    authenticate,
    requireRole(UserRole.PLAYER),
    getSocialLeaderboardHandler,
  );
  router.post(
    '/social/friends/request',
    authenticate,
    requireRole(UserRole.PLAYER),
    sendFriendRequestHandler,
  );
  router.get('/social/friends', authenticate, requireRole(UserRole.PLAYER), getFriendsHandler);
  router.get(
    '/social/friends/requests',
    authenticate,
    requireRole(UserRole.PLAYER),
    getPendingRequestsHandler,
  );
  router.post(
    '/social/friends/:id/accept',
    authenticate,
    requireRole(UserRole.PLAYER),
    acceptFriendRequestHandler,
  );
  router.post(
    '/social/friends/:id/reject',
    authenticate,
    requireRole(UserRole.PLAYER),
    rejectFriendRequestHandler,
  );
  router.delete(
    '/social/friends/:id',
    authenticate,
    requireRole(UserRole.PLAYER),
    removeFriendHandler,
  );

  return router;
}
