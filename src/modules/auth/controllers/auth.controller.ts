import { Request, Response, NextFunction } from 'express';
import { UnauthorizedError } from '../../../utils/errors';
import {
  registerPlayerSchema,
  loginSchema,
  passwordRecoverySchema,
} from '../validators/auth.validators';
import {
  registerPlayer,
  login,
  logout,
  requestPasswordRecovery,
  AuthResult,
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
 * AuthResult (register e login).
 */
function buildAuthResponse(result: AuthResult): Record<string, unknown> {
  return {
    token: result.token,
    expiresIn: result.expiresIn,
    user: serializeUser(result.user),
  };
}

/**
 * Handler per POST /auth/register.
 *
 * Valida l'input con zod, delega la creazione del Giocatore al service,
 * risponde 201 con il JWT e l'utente creato.
 */
export async function registerHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const input = registerPlayerSchema.parse(req.body);
    const result = await registerPlayer(input);
    res.status(201).json(buildAuthResponse(result));
  } catch (err) {
    next(err);
  }
}

/**
 * Handler per POST /auth/login.
 *
 * Valida l'input, autentica l'utente, risponde 200 con il JWT.
 */
export async function loginHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = loginSchema.parse(req.body);
    const result = await login(input);
    res.status(200).json(buildAuthResponse(result));
  } catch (err) {
    next(err);
  }
}

/**
 * Handler per POST /auth/logout.
 *
 * Inserisce il token corrente in blocklist. Risponde 204 No Content.
 * Il middleware authenticate ha già verificato la validità del token
 * e popolato req.token.
 */
export function logoutHandler(req: Request, res: Response, next: NextFunction): void {
  try {
    if (!req.token) {
      throw new UnauthorizedError('Token mancante', 'TOKEN_MISSING');
    }
    logout(req.token);
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
