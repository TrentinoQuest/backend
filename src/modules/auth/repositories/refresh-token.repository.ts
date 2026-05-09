import { Types } from 'mongoose';
import { RefreshToken, IRefreshToken } from '../../../database/models/RefreshToken.model';

/**
 * Repository del modulo auth per i refresh token persistiti.
 *
 * E' l'unico punto del modulo che dialoga direttamente con il modello
 * RefreshToken di Mongoose. Il service consuma queste funzioni e non
 * importa il modello, mantenendo la logica di rotation/revoca
 * indipendente dalla tecnologia di persistenza.
 */

/**
 * Persiste un nuovo refresh token nel database.
 *
 * Riceve l'hash gia' calcolato del valore in chiaro: questo strato non
 * conosce il refresh token in chiaro, in linea con la regola che il
 * valore in chiaro non deve mai essere memorizzato.
 */
export async function createRefreshToken(input: {
  userId: Types.ObjectId;
  tokenHash: string;
  expiresAt: Date;
  userAgent?: string | null;
}): Promise<IRefreshToken> {
  return RefreshToken.create({
    userId: input.userId,
    tokenHash: input.tokenHash,
    expiresAt: input.expiresAt,
    userAgent: input.userAgent ?? null,
  });
}

/**
 * Recupera un refresh token attivo per hash, se esiste.
 *
 * Un token e' considerato attivo quando esiste, non e' scaduto e non e'
 * stato revocato. La funzione ritorna null in tutti gli altri casi,
 * lasciando al chiamante la traduzione in errore applicativo.
 */
export async function findValidRefreshTokenByHash(
  tokenHash: string,
): Promise<IRefreshToken | null> {
  return RefreshToken.findOne({
    tokenHash,
    revokedAt: null,
    expiresAt: { $gt: new Date() },
  });
}

/**
 * Marca un refresh token come revocato impostando revokedAt = ora.
 *
 * Utilizzato in due scenari:
 * - logout esplicito dell'utente
 * - rotation: il token corrente viene revocato quando ne emettiamo uno nuovo
 *
 * Ritorna true se la revoca ha avuto effetto, false se il token non
 * esisteva o era gia' revocato.
 */
export async function revokeRefreshTokenByHash(tokenHash: string): Promise<boolean> {
  const result = await RefreshToken.updateOne(
    { tokenHash, revokedAt: null },
    { $set: { revokedAt: new Date() } },
  );
  return result.modifiedCount > 0;
}

/**
 * Revoca tutti i refresh token attivi di un utente.
 *
 * Utilizzato per scenari di "kill all sessions", per esempio quando
 * l'amministratore disattiva un utente o quando l'utente cambia password
 * e vuole forzare il logout su tutti i device.
 */
export async function revokeAllRefreshTokensForUser(userId: Types.ObjectId): Promise<number> {
  const result = await RefreshToken.updateMany(
    { userId, revokedAt: null },
    { $set: { revokedAt: new Date() } },
  );
  return result.modifiedCount;
}
