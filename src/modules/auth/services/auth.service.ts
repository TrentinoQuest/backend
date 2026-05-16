import jwt, { SignOptions } from 'jsonwebtoken';
import { createHash, randomBytes } from 'node:crypto';
import { env } from '../../../config/env';
import { logger } from '../../../config/logger';
import { ConflictError, UnauthorizedError } from '../../../utils/errors';
import { IUser, UserRole } from '../../../database/models/User.model';
import {
  createPlayer,
  findPlayerByUsername,
  findUserByEmail,
  findUserById,
} from '../repositories/user.repository';
import {
  createRefreshToken,
  findValidRefreshTokenByHash,
  revokeRefreshTokenByHash,
} from '../repositories/refresh-token.repository';
import {
  RegisterPlayerInput,
  LoginInput,
  PasswordRecoveryInput,
} from '../validators/auth.validators';

/**
 * Codice errore MongoDB per duplicate key.
 * Sollevato quando si tenta di inserire un valore che viola un indice unique
 * (in questo modulo, email o username gia' esistenti).
 */
const MONGO_DUPLICATE_KEY_ERROR = 11000;

/**
 * Numero di byte casuali generati per il valore in chiaro del refresh token.
 * 32 byte forniscono 256 bit di entropia, ampiamente oltre la soglia di
 * sicurezza per token random opaque.
 */
const REFRESH_TOKEN_BYTES = 32;

/**
 * Prefisso applicato al refresh token in chiaro per renderlo riconoscibile
 * nei log di applicazione e nei tool di ispezione del traffico HTTP, senza
 * influenzare la sicurezza del valore.
 */
const REFRESH_TOKEN_PREFIX = 'rt_';

/**
 * Payload contenuto nell'access token JWT.
 *
 * Volutamente minimale: include solo l'id e il ruolo dell'utente.
 * Il caricamento del documento utente completo avviene a ogni richiesta
 * autenticata tramite findUserById, garantendo che eventuali aggiornamenti
 * (cambio email, modifica profilo) siano sempre riflessi senza dover
 * invalidare i token attivi.
 */
export interface AccessTokenPayload {
  sub: string;
  role: UserRole;
}

/**
 * Coppia di token emessa al client al login, register e refresh.
 */
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  accessExpiresIn: string;
  refreshExpiresIn: string;
}

/**
 * Risultato delle operazioni di autenticazione che emettono token.
 */
export interface AuthResult extends TokenPair {
  user: IUser;
}

/**
 * Genera un access token JWT firmato per l'utente specificato.
 */
function generateAccessToken(user: IUser): string {
  const payload: AccessTokenPayload = {
    sub: String(user._id),
    role: user.role,
  };
  const options: SignOptions = {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN as SignOptions['expiresIn'],
  };
  return jwt.sign(payload, env.JWT_SECRET, options);
}

/**
 * Genera un refresh token random crittograficamente sicuro.
 *
 * Il token e' una stringa opaque (non un JWT) composta da un prefisso
 * applicativo seguito da bytes random codificati in hex. Il prefisso
 * non aggiunge sicurezza ma rende riconoscibili i refresh token nei log.
 */
function generateRefreshTokenValue(): string {
  return REFRESH_TOKEN_PREFIX + randomBytes(REFRESH_TOKEN_BYTES).toString('hex');
}

/**
 * Calcola l'hash SHA-256 di un refresh token.
 *
 * Usato sia in fase di emissione (per memorizzare l'hash invece del valore
 * in chiaro) sia in fase di validazione (per cercare l'hash nel DB partendo
 * dal valore inviato dal client).
 */
function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Calcola la data di scadenza di un refresh token a partire dalla durata
 * configurata in env (es. "30d", "7d").
 *
 * Supporta i formati di durata accettati anche da jsonwebtoken: numero
 * seguito da d (giorni), h (ore), m (minuti), s (secondi).
 */
function computeRefreshTokenExpiry(): Date {
  const duration = env.JWT_REFRESH_EXPIRES_IN;
  const match = /^(\d+)([dhms])$/.exec(duration);
  if (!match) {
    throw new Error(`JWT_REFRESH_EXPIRES_IN non valido: ${duration}`);
  }
  const value = Number(match[1]);
  const unit = match[2];
  const multiplierByUnit: Record<string, number> = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };
  const milliseconds = value * multiplierByUnit[unit];
  return new Date(Date.now() + milliseconds);
}

/**
 * Emette una nuova coppia access+refresh per l'utente specificato e
 * persiste l'hash del refresh token nel database.
 *
 * userAgent e' opzionale e viene memorizzato passivamente per future
 * funzionalita' di device management.
 */
async function issueTokenPair(user: IUser, userAgent?: string | null): Promise<TokenPair> {
  const accessToken = generateAccessToken(user);
  const refreshTokenValue = generateRefreshTokenValue();
  const refreshTokenHash = hashRefreshToken(refreshTokenValue);
  const expiresAt = computeRefreshTokenExpiry();

  await createRefreshToken({
    userId: user._id,
    tokenHash: refreshTokenHash,
    expiresAt,
    userAgent: userAgent ?? null,
  });

  return {
    accessToken,
    refreshToken: refreshTokenValue,
    accessExpiresIn: env.JWT_ACCESS_EXPIRES_IN,
    refreshExpiresIn: env.JWT_REFRESH_EXPIRES_IN,
  };
}

/**
 * Verifica un access token JWT e ne estrae il payload tipizzato.
 *
 * Lancia un UnauthorizedError se il token e' malformato, scaduto o
 * firmato con un secret diverso. La revoca server-side dell'access
 * token non viene controllata: l'access token ha vita breve (15 minuti)
 * e si fa affidamento sulla rotation del refresh token per limitare
 * il rischio in caso di compromissione.
 */
export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    return jwt.verify(token, env.JWT_SECRET) as AccessTokenPayload;
  } catch {
    throw new UnauthorizedError('Token non valido o scaduto', 'INVALID_TOKEN');
  }
}

/**
 * Carica l'utente corrispondente al payload dell'access token.
 *
 * Restituisce sempre il documento aggiornato dal database: garantisce che
 * eventuali modifiche al profilo siano riflesse anche per gli access token
 * gia' emessi.
 */
export async function loadUserFromPayload(payload: AccessTokenPayload): Promise<IUser> {
  const user = await findUserById(payload.sub);
  if (!user) {
    throw new UnauthorizedError('Utente non trovato', 'USER_NOT_FOUND');
  }
  return user;
}

/**
 * Registra un nuovo Giocatore.
 *
 * Verifica preventivamente la disponibilita' di email e username, quindi
 * crea il documento delegando l'hashing della password al middleware
 * Mongoose. Restituisce la coppia access+refresh token pronta per l'uso.
 */
export async function registerPlayer(
  input: RegisterPlayerInput,
  userAgent?: string | null,
): Promise<AuthResult> {
  const existingByEmail = await findUserByEmail(input.email);
  if (existingByEmail) {
    throw new ConflictError("Email gia' registrata", 'EMAIL_ALREADY_USED');
  }

  const existingByUsername = await findPlayerByUsername(input.username);
  if (existingByUsername) {
    throw new ConflictError("Username gia' in uso", 'USERNAME_ALREADY_USED');
  }

  try {
    const player = await createPlayer(input);
    const tokenPair = await issueTokenPair(player, userAgent);
    return { ...tokenPair, user: player };
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      throw new ConflictError("Email o username gia' in uso", 'DUPLICATE_KEY');
    }
    throw err;
  }
}

/**
 * Autentica un utente con email e password.
 *
 * Per evitare di rivelare se un'email e' registrata o meno, restituisce
 * sempre lo stesso errore generico ("credenziali non valide") sia in caso
 * di email inesistente sia in caso di password sbagliata.
 */
export async function login(input: LoginInput, userAgent?: string | null): Promise<AuthResult> {
  const user = await findUserByEmail(input.email);
  if (!user) {
    throw new UnauthorizedError('Credenziali non valide', 'INVALID_CREDENTIALS');
  }

  const isValid = await user.comparePassword(input.password);
  if (!isValid) {
    throw new UnauthorizedError('Credenziali non valide', 'INVALID_CREDENTIALS');
  }

  const tokenPair = await issueTokenPair(user, userAgent);
  return { ...tokenPair, user };
}

/**
 * Rinnova la coppia di token a partire da un refresh token valido.
 *
 * Implementa il pattern di rotation: il refresh token corrente viene
 * revocato e ne viene emesso uno nuovo. Se il refresh token ricevuto e'
 * sconosciuto, scaduto o gia' revocato, lancia UnauthorizedError.
 */
export async function refreshTokens(
  refreshTokenValue: string,
  userAgent?: string | null,
): Promise<TokenPair> {
  const tokenHash = hashRefreshToken(refreshTokenValue);
  const stored = await findValidRefreshTokenByHash(tokenHash);
  if (!stored) {
    throw new UnauthorizedError(
      'Refresh token non valido, scaduto o revocato',
      'INVALID_REFRESH_TOKEN',
    );
  }

  const user = await findUserById(String(stored.userId));
  if (!user) {
    throw new UnauthorizedError('Utente non trovato', 'USER_NOT_FOUND');
  }

  await revokeRefreshTokenByHash(tokenHash);
  return issueTokenPair(user, userAgent);
}

/**
 * Termina la sessione corrente revocando il refresh token specificato.
 *
 * Idempotente: se il token non esiste o e' gia' revocato, l'operazione
 * non solleva errori. Questo evita che il client veda errori in casi di
 * doppio click su logout o di richieste duplicate per problemi di rete.
 */
export async function logout(refreshTokenValue: string): Promise<void> {
  const tokenHash = hashRefreshToken(refreshTokenValue);
  await revokeRefreshTokenByHash(tokenHash);
}

/**
 * Avvia il flusso di recovery password.
 *
 * Per evitare di rivelare se un'email e' registrata o meno, la funzione
 * non lancia errori se l'utente non esiste: ritorna sempre con successo.
 *
 * In questa fase l'invio email e' mockato: il link di recovery viene
 * loggato sul terminale del backend invece di essere inviato. Verra'
 * sostituito con un servizio email reale quando il flusso sara' completo.
 */
export async function requestPasswordRecovery(input: PasswordRecoveryInput): Promise<void> {
  const user = await findUserByEmail(input.email);
  if (!user) {
    return;
  }

  const recoveryToken = randomBytes(32).toString('hex');
  const recoveryLink = `http://localhost:3000/api/v1/auth/password-reset?token=${recoveryToken}`;

  logger.info(
    { email: user.email, recoveryLink },
    '[MOCK EMAIL] Link di recovery password generato',
  );
}

/**
 * Type guard per identificare gli errori di duplicate key di MongoDB.
 *
 * Mongoose propaga gli errori del driver native con il campo "code"
 * popolato. Questa funzione consente di intercettarli senza dipendere
 * dai tipi specifici dei driver.
 */
function isDuplicateKeyError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: unknown }).code === MONGO_DUPLICATE_KEY_ERROR
  );
}
