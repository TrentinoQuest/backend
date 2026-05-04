import jwt, { SignOptions } from 'jsonwebtoken';
import { randomBytes } from 'node:crypto';
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
  RegisterPlayerInput,
  LoginInput,
  PasswordRecoveryInput,
} from '../validators/auth.validators';

/**
 * Codice errore MongoDB per duplicate key.
 * Sollevato quando si tenta di inserire un valore che viola un indice unique
 * (in questo modulo, email o username già esistenti).
 */
const MONGO_DUPLICATE_KEY_ERROR = 11000;

/**
 * Payload contenuto nel JWT.
 *
 * Volutamente minimale: include solo l'id e il ruolo dell'utente.
 * Il caricamento del documento utente completo avviene a ogni richiesta
 * autenticata tramite findUserById, garantendo che eventuali aggiornamenti
 * (cambio email, modifica profilo) siano sempre riflessi senza dover
 * invalidare i token attivi.
 */
export interface JwtPayload {
  sub: string;
  role: UserRole;
}

/**
 * Forma della risposta restituita da register e login.
 * Contiene il token JWT, la sua durata di validità e l'utente autenticato.
 */
export interface AuthResult {
  token: string;
  expiresIn: string;
  user: IUser;
}

/**
 * Blocklist in-memory dei JWT revocati prima della loro scadenza naturale.
 *
 * Utilizzata dal flusso di logout per invalidare i token attivi senza
 * dover attendere che scadano da soli. La memorizzazione è limitata alla
 * vita del processo: in produzione andrà sostituita con un Redis condiviso.
 *
 * La struttura è una Set per garantire lookup O(1) durante la validazione.
 */
const tokenBlocklist = new Set<string>();

/**
 * Genera un JWT firmato per l'utente specificato.
 *
 * Il payload include l'id come subject standard JWT (sub) e il ruolo,
 * informazione utilizzata dal middleware RBAC per autorizzare le route.
 */
function generateToken(user: IUser): string {
  const payload: JwtPayload = {
    sub: String(user._id),
    role: user.role,
  };
  const options: SignOptions = {
    expiresIn: env.JWT_EXPIRES_IN as SignOptions['expiresIn'],
  };
  return jwt.sign(payload, env.JWT_SECRET, options);
}

/**
 * Verifica un JWT e ne estrae il payload tipizzato.
 *
 * Lancia un UnauthorizedError se il token è malformato, scaduto, firmato
 * con un secret diverso, oppure presente nella blocklist (revocato via
 * logout).
 */
export function verifyToken(token: string): JwtPayload {
  if (tokenBlocklist.has(token)) {
    throw new UnauthorizedError('Token revocato', 'TOKEN_REVOKED');
  }
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
    return decoded;
  } catch {
    throw new UnauthorizedError('Token non valido o scaduto', 'INVALID_TOKEN');
  }
}

/**
 * Carica l'utente corrispondente al payload del JWT.
 *
 * Restituisce sempre il documento aggiornato dal database: garantisce che
 * eventuali modifiche al profilo siano riflesse anche per i token già emessi.
 */
export async function loadUserFromPayload(payload: JwtPayload): Promise<IUser> {
  const user = await findUserById(payload.sub);
  if (!user) {
    throw new UnauthorizedError('Utente non trovato', 'USER_NOT_FOUND');
  }
  return user;
}

/**
 * Registra un nuovo Giocatore.
 *
 * Verifica preventivamente la disponibilità di email e username, quindi
 * crea il documento delegando l'hashing al middleware Mongoose. Il check
 * preventivo migliora i messaggi di errore rispetto al solo affidarsi
 * al duplicate key error MongoDB.
 *
 * Restituisce il token JWT pronto per l'uso, evitando al client una
 * chiamata di login successiva.
 */
export async function registerPlayer(input: RegisterPlayerInput): Promise<AuthResult> {
  const existingByEmail = await findUserByEmail(input.email);
  if (existingByEmail) {
    throw new ConflictError('Email già registrata', 'EMAIL_ALREADY_USED');
  }

  const existingByUsername = await findPlayerByUsername(input.username);
  if (existingByUsername) {
    throw new ConflictError('Username già in uso', 'USERNAME_ALREADY_USED');
  }

  try {
    const player = await createPlayer(input);
    const token = generateToken(player);
    return { token, expiresIn: env.JWT_EXPIRES_IN, user: player };
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      throw new ConflictError('Email o username già in uso', 'DUPLICATE_KEY');
    }
    throw err;
  }
}

/**
 * Autentica un utente con email e password.
 *
 * Per evitare di rivelare se un'email è registrata o meno, restituisce
 * sempre lo stesso errore generico ("credenziali non valide") sia in caso
 * di email inesistente sia in caso di password sbagliata.
 */
export async function login(input: LoginInput): Promise<AuthResult> {
  const user = await findUserByEmail(input.email);
  if (!user) {
    throw new UnauthorizedError('Credenziali non valide', 'INVALID_CREDENTIALS');
  }

  const isValid = await user.comparePassword(input.password);
  if (!isValid) {
    throw new UnauthorizedError('Credenziali non valide', 'INVALID_CREDENTIALS');
  }

  const token = generateToken(user);
  return { token, expiresIn: env.JWT_EXPIRES_IN, user };
}

/**
 * Termina la sessione corrente inserendo il token in blocklist.
 *
 * Da quel momento qualsiasi richiesta che presenti questo token verrà
 * rifiutata da verifyToken, anche se il JWT è ancora valido per scadenza.
 */
export function logout(token: string): void {
  tokenBlocklist.add(token);
}

/**
 * Avvia il flusso di recovery password.
 *
 * Per evitare di rivelare se un'email è registrata o meno, la funzione
 * non lancia errori se l'utente non esiste: ritorna sempre con successo.
 *
 * In questa fase l'invio email è mockato: il link di recovery viene
 * loggato sul terminale del backend invece di essere inviato. Verrà
 * sostituito con un servizio email reale quando il flusso sarà completo.
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
