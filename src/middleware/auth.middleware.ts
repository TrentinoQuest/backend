import { Request, Response, NextFunction } from 'express';
import { UnauthorizedError, ForbiddenError } from '../utils/errors';
import { IUser, UserRole } from '../database/models/User.model';
import { verifyAccessToken, loadUserFromPayload } from '../modules/auth/services/auth.service';

/**
 * Estensione del tipo Request di Express per includere l'utente autenticato.
 *
 * Dopo che il middleware authenticate è stato eseguito, req.user contiene
 * il documento utente completo recuperato dal database. Le route protette
 * possono quindi accedere a req.user con typing forte senza ulteriori
 * controlli o cast.
 */
declare module 'express-serve-static-core' {
  interface Request {
    user?: IUser;
    token?: string;
  }
}

/**
 * Estrae il token JWT dall'header Authorization.
 *
 * Accetta solo lo schema "Bearer <token>" come da specifica OpenAPI e
 * restituisce null se il formato non è rispettato o l'header è assente.
 */
function extractTokenFromHeader(authHeader: string | undefined): string | null {
  if (!authHeader) {
    return null;
  }
  const [scheme, token] = authHeader.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return null;
  }
  return token;
}

/**
 * Middleware di autenticazione JWT.
 *
 * Verifica la presenza e la validità del token JWT nell'header Authorization,
 * carica l'utente corrispondente dal database e popola req.user.
 *
 * Se il token è assente, malformato, scaduto o revocato, lancia un
 * UnauthorizedError che il middleware di error handling globale
 * trasformerà in una response 401.
 */
export async function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const token = extractTokenFromHeader(req.headers.authorization);
    if (!token) {
      throw new UnauthorizedError('Token JWT mancante', 'TOKEN_MISSING');
    }

    const payload = verifyAccessToken(token);
    const user = await loadUserFromPayload(payload);

    req.user = user;
    req.token = token;
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Factory di middleware per autorizzazione basata sul ruolo (RBAC).
 *
 * Ritorna un middleware che permette il passaggio solo se req.user.role
 * è incluso nei ruoli consentiti. Va sempre registrato dopo authenticate,
 * perché si aspetta req.user popolato.
 *
 * Esempio d'uso nelle route:
 *   router.delete('/quests/:id', authenticate, requireRole(UserRole.ADMIN), handler);
 */
export function requireRole(...allowedRoles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new UnauthorizedError('Autenticazione richiesta', 'AUTH_REQUIRED'));
      return;
    }
    if (!allowedRoles.includes(req.user.role)) {
      next(new ForbiddenError('Permessi insufficienti', 'INSUFFICIENT_ROLE'));
      return;
    }
    next();
  };
}
