import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import {
  sendKudos,
  getFeed,
  getFriendSuggestions,
  sendFriendRequest,
  respondFriendRequest,
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

const suggestionsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(20).default(10),
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

export async function getSuggestionsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw new UnauthorizedError('Autenticazione richiesta', 'AUTH_REQUIRED');
    const { limit } = suggestionsQuerySchema.parse(req.query);
    const suggestions = await getFriendSuggestions(String(req.user._id), limit);
    res.status(200).json(suggestions);
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

export async function respondFriendRequestHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw new UnauthorizedError('Autenticazione richiesta', 'AUTH_REQUIRED');
    const { requesterId, accept } = z
      .object({ requesterId: z.string().regex(/^[a-f0-9]{24}$/i), accept: z.boolean() })
      .strict()
      .parse(req.body);
    await respondFriendRequest(String(req.user._id), requesterId, accept);
    res.status(200).json({ message: accept ? 'Amicizia accettata' : 'Richiesta rifiutata' });
  } catch (err) {
    next(err);
  }
}
