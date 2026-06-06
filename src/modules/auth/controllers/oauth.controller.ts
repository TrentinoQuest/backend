import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { OAuth2Client } from 'google-auth-library';
import * as jwt from 'jsonwebtoken';
import type { AuthResponse } from '@trentino-quest/shared-types';
import { Player, IPlayer, UserRole } from '../../../database/models/User.model';
import { issueTokenPair, AuthResult } from '../services/auth.service';
import { BadRequestError } from '../../../utils/errors';
import { env } from '../../../config/env';
import { computeLevelFromXp, computeXpToNextLevel } from '../../../config/gamification';

const googleBodySchema = z.object({ idToken: z.string().min(1) }).strict();
const appleBodySchema = z
  .object({
    idToken: z.string().min(1),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
  })
  .strict();

function serializePlayer(player: IPlayer): Record<string, unknown> {
  const obj = player.toObject({ versionKey: false });
  delete (obj as Record<string, unknown>).password;
  delete (obj as Record<string, unknown>).oauthId;
  delete (obj as Record<string, unknown>).fcmToken;
  const { title: levelTitle } = computeLevelFromXp(player.xp ?? 0);
  return {
    ...obj,
    id: String(player._id),
    levelTitle,
    xpToNextLevel: computeXpToNextLevel(player.xp ?? 0),
  };
}

function buildAuthResponse(result: AuthResult): AuthResponse {
  return {
    accessToken: result.accessToken,
    refreshToken: result.refreshToken,
    accessExpiresIn: result.accessExpiresIn,
    refreshExpiresIn: result.refreshExpiresIn,
    user: serializePlayer(result.user as IPlayer) as unknown as AuthResponse['user'],
  };
}

function generateUniqueUsername(base: string): string {
  const suffix = Math.floor(Math.random() * 9000) + 1000;
  return `${base.slice(0, 20)}${suffix}`;
}

async function findOrCreateOAuthPlayer(
  email: string,
  oauthProvider: 'google' | 'apple',
  oauthId: string,
  displayName?: string,
): Promise<IPlayer> {
  let player = await Player.findOne({ oauthProvider, oauthId });

  if (player) {
    if (player.email !== email) {
      player.email = email;
      await player.save();
    }
    return player;
  }

  const baseUsername = (displayName ?? email.split('@')[0]).replace(/[^a-zA-Z0-9_]/g, '');
  let username = baseUsername.slice(0, 24);
  while (await Player.exists({ username })) {
    username = generateUniqueUsername(baseUsername);
  }

  player = new Player({
    email,
    password: null,
    username,
    oauthProvider,
    oauthId,
    role: UserRole.PLAYER,
  });
  await player.save();
  return player;
}

async function verifyGoogleToken(idToken: string): Promise<{ email: string; sub: string }> {
  if (env.SKIP_OAUTH_VERIFICATION) {
    const decoded = jwt.decode(idToken) as Record<string, string> | null;
    if (!decoded?.email || !decoded?.sub) {
      throw new BadRequestError(
        'Token finto malformato (SKIP_OAUTH_VERIFICATION)',
        'INVALID_TOKEN',
      );
    }
    return { email: decoded.email, sub: decoded.sub };
  }

  const clientId = env.GOOGLE_CLIENT_ID;
  if (!clientId)
    throw new BadRequestError('GOOGLE_CLIENT_ID non configurato', 'OAUTH_NOT_CONFIGURED');

  const client = new OAuth2Client(clientId);
  const ticket = await client.verifyIdToken({ idToken, audience: clientId });
  const payload = ticket.getPayload();
  if (!payload?.email || !payload.sub) {
    throw new BadRequestError('Token Google non valido', 'INVALID_TOKEN');
  }
  return { email: payload.email, sub: payload.sub };
}

function verifyAppleToken(idToken: string): { email: string; sub: string } {
  if (env.SKIP_OAUTH_VERIFICATION) {
    const decoded = jwt.decode(idToken) as Record<string, string> | null;
    if (!decoded?.email || !decoded?.sub) {
      throw new BadRequestError(
        'Token finto malformato (SKIP_OAUTH_VERIFICATION)',
        'INVALID_TOKEN',
      );
    }
    return { email: decoded.email, sub: decoded.sub };
  }

  // La verifica completa della firma richiede l'account Apple Developer e
  // il fetch delle chiavi pubbliche JWKS. Non implementato: richiede
  // SKIP_OAUTH_VERIFICATION=true in sviluppo locale.
  throw new BadRequestError(
    'Verifica Apple non configurata: imposta SKIP_OAUTH_VERIFICATION=true in sviluppo',
    'APPLE_NOT_CONFIGURED',
  );
}

export async function googleOAuthHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { idToken } = googleBodySchema.parse(req.body);
    const { email, sub } = await verifyGoogleToken(idToken);
    const player = await findOrCreateOAuthPlayer(email, 'google', sub);
    const userAgent = req.headers['user-agent'] ?? null;
    const tokenPair = await issueTokenPair(player, userAgent);
    const result: AuthResult = { ...tokenPair, user: player };
    res.status(200).json(buildAuthResponse(result));
  } catch (err) {
    next(err);
  }
}

export async function appleOAuthHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { idToken, firstName, lastName } = appleBodySchema.parse(req.body);
    const { email, sub } = verifyAppleToken(idToken);
    const displayName = firstName ? `${firstName}${lastName ? lastName : ''}` : undefined;
    const player = await findOrCreateOAuthPlayer(email, 'apple', sub, displayName);
    const userAgent = req.headers['user-agent'] ?? null;
    const tokenPair = await issueTokenPair(player, userAgent);
    const result: AuthResult = { ...tokenPair, user: player };
    res.status(200).json(buildAuthResponse(result));
  } catch (err) {
    next(err);
  }
}
