import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { OAuth2Client } from 'google-auth-library';
import * as jwt from 'jsonwebtoken';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { AuthResponse } from '@trentino-quest/shared-types';
import { Player, IPlayer, UserRole } from '../../../database/models/User.model';
import { findUserByEmail } from '../repositories/user.repository';
import { issueTokenPair, AuthResult } from '../services/auth.service';
import { BadRequestError, ConflictError } from '../../../utils/errors';
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

/**
 * JWKS pubblico di Apple per la verifica della firma degli identity token.
 * createRemoteJWKSet gestisce internamente fetch e caching delle chiavi.
 */
const APPLE_JWKS = createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'));
const APPLE_ISSUER = 'https://appleid.apple.com';

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
  const player = await Player.findOne({ oauthProvider, oauthId });

  if (player) {
    // Aggiorna l'email solo se non e' gia' usata da un altro account:
    // in caso di conflitto manteniamo quella esistente invece di fallire.
    if (player.email !== email) {
      const emailOwner = await findUserByEmail(email);
      if (!emailOwner || String(emailOwner._id) === String(player._id)) {
        player.email = email;
        await player.save();
      }
    }
    return player;
  }

  // L'email e' gia' registrata con un altro metodo (password o altro
  // provider): non creiamo un secondo account ne' colleghiamo in automatico
  // (il chiamante non ha dimostrato il possesso dell'account esistente).
  const existingByEmail = await findUserByEmail(email);
  if (existingByEmail) {
    throw new ConflictError(
      "Email gia' registrata con un altro metodo di accesso",
      'EMAIL_ALREADY_USED',
    );
  }

  const stripped = (displayName ?? email.split('@')[0]).replace(/[^a-zA-Z0-9_]/g, '');
  // Fallback se la parte locale dell'email non contiene caratteri ammessi:
  // lo schema richiede username di almeno 3 caratteri.
  const baseUsername = stripped.length >= 3 ? stripped : 'player';
  let username = baseUsername.slice(0, 24);
  while (await Player.exists({ username })) {
    username = generateUniqueUsername(baseUsername);
  }

  const created = new Player({
    email,
    password: null,
    username,
    oauthProvider,
    oauthId,
    role: UserRole.PLAYER,
  });
  await created.save();
  return created;
}

/**
 * Decodifica un token finto senza verificarne la firma.
 * Consentito SOLO con SKIP_OAUTH_VERIFICATION=true, che env.ts
 * rifiuta in produzione (fail-fast all'avvio).
 */
function decodeUnverifiedToken(idToken: string): { email: string; sub: string } {
  const decoded = jwt.decode(idToken) as Record<string, string> | null;
  if (!decoded?.email || !decoded?.sub) {
    throw new BadRequestError('Token finto malformato (SKIP_OAUTH_VERIFICATION)', 'INVALID_TOKEN');
  }
  return { email: decoded.email, sub: decoded.sub };
}

async function verifyGoogleToken(idToken: string): Promise<{ email: string; sub: string }> {
  if (env.SKIP_OAUTH_VERIFICATION) {
    return decodeUnverifiedToken(idToken);
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

async function verifyAppleToken(idToken: string): Promise<{ email: string; sub: string }> {
  if (env.SKIP_OAUTH_VERIFICATION) {
    return decodeUnverifiedToken(idToken);
  }

  const clientId = env.APPLE_CLIENT_ID;
  if (!clientId)
    throw new BadRequestError('APPLE_CLIENT_ID non configurato', 'OAUTH_NOT_CONFIGURED');

  try {
    const { payload } = await jwtVerify(idToken, APPLE_JWKS, {
      issuer: APPLE_ISSUER,
      audience: clientId,
    });
    const email = payload.email;
    const sub = payload.sub;
    if (typeof email !== 'string' || typeof sub !== 'string') {
      throw new BadRequestError('Token Apple non valido', 'INVALID_TOKEN');
    }
    return { email, sub };
  } catch (err) {
    if (err instanceof BadRequestError) throw err;
    throw new BadRequestError('Token Apple non valido', 'INVALID_TOKEN');
  }
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
    const { email, sub } = await verifyAppleToken(idToken);
    const displayName = firstName ? [firstName, lastName].filter(Boolean).join(' ') : undefined;
    const player = await findOrCreateOAuthPlayer(email, 'apple', sub, displayName);
    const userAgent = req.headers['user-agent'] ?? null;
    const tokenPair = await issueTokenPair(player, userAgent);
    const result: AuthResult = { ...tokenPair, user: player };
    res.status(200).json(buildAuthResponse(result));
  } catch (err) {
    next(err);
  }
}
