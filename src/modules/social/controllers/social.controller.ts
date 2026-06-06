import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import {
  sendKudos,
  getFeed,
  getSocialLeaderboard,
  sendFriendRequest,
  getFriends,
  getPendingRequests,
  acceptFriendRequest,
  rejectFriendRequest,
  removeFriend,
} from '../services/social.service';
import { UnauthorizedError } from '../../../utils/errors';

const kudosSchema = z
  .object({
    toPlayerId: z.string().regex(/^[a-f0-9]{24}$/i),
    activityType: z.string().min(1),
    activityId: z.string().min(1),
    emoji: z.enum(['beer', 'highfive', 'star']),
  })
  .strict();

const feedQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export async function sendKudosHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw new UnauthorizedError('Autenticazione richiesta', 'AUTH_REQUIRED');
    const body = kudosSchema.parse(req.body);
    await sendKudos(
      String(req.user._id),
      body.toPlayerId,
      body.activityType,
      body.activityId,
      body.emoji,
    );
    res.status(201).json({ message: 'Kudos inviato' });
  } catch (err) {
    next(err);
  }
}

export async function getFeedHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw new UnauthorizedError('Autenticazione richiesta', 'AUTH_REQUIRED');
    const { limit, offset } = feedQuerySchema.parse(req.query);
    const items = await getFeed(String(req.user._id), limit, offset);
    res.status(200).json(items);
  } catch (err) {
    next(err);
  }
}

export async function getSocialLeaderboardHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw new UnauthorizedError('Autenticazione richiesta', 'AUTH_REQUIRED');
    const entries = await getSocialLeaderboard(String(req.user._id));
    res.status(200).json(entries);
  } catch (err) {
    next(err);
  }
}

export async function sendFriendRequestHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw new UnauthorizedError('Autenticazione richiesta', 'AUTH_REQUIRED');
    const { recipientId } = z
      .object({ recipientId: z.string().regex(/^[a-f0-9]{24}$/i) })
      .strict()
      .parse(req.body);
    await sendFriendRequest(String(req.user._id), recipientId);
    res.status(201).json({ message: 'Richiesta amicizia inviata' });
  } catch (err) {
    next(err);
  }
}

export async function getFriendsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw new UnauthorizedError('Autenticazione richiesta', 'AUTH_REQUIRED');
    const friends = await getFriends(String(req.user._id));
    res.status(200).json(friends);
  } catch (err) {
    next(err);
  }
}

export async function getPendingRequestsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw new UnauthorizedError('Autenticazione richiesta', 'AUTH_REQUIRED');
    const requests = await getPendingRequests(String(req.user._id));
    res.status(200).json(requests);
  } catch (err) {
    next(err);
  }
}

export async function acceptFriendRequestHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw new UnauthorizedError('Autenticazione richiesta', 'AUTH_REQUIRED');
    await acceptFriendRequest(String(req.params['id']), String(req.user._id));
    res.status(200).json({ message: 'Amicizia accettata' });
  } catch (err) {
    next(err);
  }
}

export async function rejectFriendRequestHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw new UnauthorizedError('Autenticazione richiesta', 'AUTH_REQUIRED');
    await rejectFriendRequest(String(req.params['id']), String(req.user._id));
    res.status(200).json({ message: 'Richiesta rifiutata' });
  } catch (err) {
    next(err);
  }
}

export async function removeFriendHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw new UnauthorizedError('Autenticazione richiesta', 'AUTH_REQUIRED');
    await removeFriend(String(req.params['id']), String(req.user._id));
    res.status(200).json({ message: 'Amico rimosso' });
  } catch (err) {
    next(err);
  }
}
