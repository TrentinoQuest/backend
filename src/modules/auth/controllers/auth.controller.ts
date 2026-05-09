import { Request, Response, NextFunction } from 'express';
import type { AuthResponse } from '@trentino-quest/shared-types';
import {
  registerPlayerSchema,
  loginSchema,
  passwordRecoverySchema,
  refreshTokenSchema,
  logoutSchema,
} from '../validators/auth.validators';
import {
  registerPlayer,
  login,
  logout,
  refreshTokens,
  requestPasswordRecovery,
  AuthResult,
  TokenPair,
} from '../services/auth.service';
import { IUser } from '../../../database/models/User.model';

/**
 * Serializza un utente per la response HTTP.
 *
 * Esclude la password e altri campi che non devono mai essere esposti
 * tramite API. Mantiene tutti i campi specifici del ruolo grazie al
 * discriminator pattern di Mongoose.
 */
function serializeUser(user: IUser): Record<string, unknown> {
  const obj = user.toObject({ versionKey: false });
  delete (obj as Record<string, unknown>).password;
  return {
    ...obj,
    id: String(user._id),
  };
}

/**
 * Costruisce la response standard per gli endpoint che ritornano un
 * AuthResult (register e login). Garantisce coerenza con lo schema
 * AuthResponse condiviso via shared-types.
 */
function buildAuthResponse(result: AuthResult): AuthResponse {
  return {
    accessToken: result.accessToken,
    refreshToken: result.refreshToken,
    accessExpiresIn: result.accessExpiresIn,
    refreshExpiresIn: result.refreshExpiresIn,
    user: serializeUser(result.user) as unknown as AuthResponse['user'],
  };
}

/**
 * Costruisce la response per l'endpoint /auth/refresh.
 *
 * Strutturalmente simile ad AuthResponse ma senza il campo user, dato
 * che il refresh non altera l'identita' dell'utente autenticato.
 */
function buildRefreshResponse(pair: TokenPair): Record<string, string> {
  return {
    accessToken: pair.accessToken,
    refreshToken: pair.refreshToken,
    accessExpiresIn: pair.accessExpiresIn,
    refreshExpiresIn: pair.refreshExpiresIn,
  };
}

/**
 * Estrae lo user agent dall'header della richiesta, troncandolo a una
 * lunghezza ragionevole per evitare di salvare valori abnormi.
 */
function extractUserAgent(req: Request): string | null {
  const ua = req.headers['user-agent'];
  if (!ua) {
    return null;
  }
  return ua.slice(0, 500);
}

/**
 * Handler per POST /auth/register.
 *
 * Valida l'input con zod, delega la creazione del Giocatore al service,
 * risponde 201 con la coppia access+refresh e l'utente creato.
 */
export async function registerHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const input = registerPlayerSchema.parse(req.body);
    const result = await registerPlayer(input, extractUserAgent(req));
    res.status(201).json(buildAuthResponse(result));
  } catch (err) {
    next(err);
  }
}

/**
 * Handler per POST /auth/login.
 *
 * Valida l'input, autentica l'utente, risponde 200 con la coppia
 * access+refresh.
 */
export async function loginHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = loginSchema.parse(req.body);
    const result = await login(input, extractUserAgent(req));
    res.status(200).json(buildAuthResponse(result));
  } catch (err) {
    next(err);
  }
}

/**
 * Handler per POST /auth/refresh.
 *
 * Valida l'input, delega al service il rinnovo dei token con rotation,
 * risponde 200 con la nuova coppia di token.
 */
export async function refreshHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const input = refreshTokenSchema.parse(req.body);
    const pair = await refreshTokens(input.refreshToken, extractUserAgent(req));
    res.status(200).json(buildRefreshResponse(pair));
  } catch (err) {
    next(err);
  }
}

/**
 * Handler per POST /auth/logout.
 *
 * Riceve il refresh token nel body e lo revoca. Idempotente: se il
 * token non e' valido o gia' revocato, risponde comunque 204 per
 * coerenza con il comportamento del service.
 */
export async function logoutHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const input = logoutSchema.parse(req.body);
    await logout(input.refreshToken);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

/**
 * Handler per POST /auth/password-recovery.
 *
 * Valida l'input e avvia il flusso di recovery. Risponde sempre 202
 * indipendentemente dall'esistenza dell'email per non rivelare quali
 * email sono registrate.
 */
export async function passwordRecoveryHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const input = passwordRecoverySchema.parse(req.body);
    await requestPasswordRecovery(input);
    res.status(202).send();
  } catch (err) {
    next(err);
  }
}
