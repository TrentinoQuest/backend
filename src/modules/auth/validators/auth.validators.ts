import { z } from 'zod';

/**
 * Validator zod per la richiesta di registrazione di un nuovo Giocatore.
 *
 * Le regole replicano e rafforzano lo schema OpenAPI:
 * - email: stringa, formato email, normalizzata in lowercase e trim
 * - password: almeno 8 caratteri, almeno una lettera e almeno un numero
 * - username: 3-30 caratteri, solo lettere/numeri/underscore, trim
 *
 * Il refinement finale impedisce che username e password coincidano,
 * regola di sicurezza non esprimibile nel JSON Schema dell'OpenAPI.
 */
export const registerPlayerSchema = z
  .object({
    email: z.string().trim().toLowerCase().email('Formato email non valido'),
    password: z
      .string()
      .min(8, 'La password deve contenere almeno 8 caratteri')
      .regex(/[A-Za-z]/, 'La password deve contenere almeno una lettera')
      .regex(/[0-9]/, 'La password deve contenere almeno un numero'),
    username: z
      .string()
      .trim()
      .min(3, 'Lo username deve contenere almeno 3 caratteri')
      .max(30, 'Lo username non può superare 30 caratteri')
      .regex(/^[A-Za-z0-9_]+$/, 'Lo username può contenere solo lettere, numeri e underscore'),
  })
  .refine((data) => data.username.toLowerCase() !== data.password.toLowerCase(), {
    message: 'Username e password non possono coincidere',
    path: ['password'],
  });

/**
 * Tipo TypeScript inferito dallo schema di registrazione Giocatore.
 * Garantisce che il payload validato dal controller sia tipizzato senza
 * dichiarazioni manuali ridondanti.
 */
export type RegisterPlayerInput = z.infer<typeof registerPlayerSchema>;

export const deviceTokenSchema = z.object({ fcmToken: z.string().min(1) }).strict();
export type DeviceTokenInput = z.infer<typeof deviceTokenSchema>;

/**
 * Validator zod per la richiesta di login.
 *
 * Replica lo schema OpenAPI ma applica la normalizzazione (lowercase + trim)
 * sull'email per garantire che il lookup in database avvenga in forma
 * canonica indipendentemente dal modo in cui il client la invia.
 */
export const loginSchema = z
  .object({
    email: z.string().trim().toLowerCase().email('Formato email non valido'),
    password: z.string().min(1, 'Password obbligatoria'),
  })
  .strict();

/**
 * Tipo TypeScript inferito dallo schema di login.
 */
export type LoginInput = z.infer<typeof loginSchema>;

/**
 * Validator zod per la richiesta di password recovery.
 *
 * Accetta solo l'email del destinatario. La normalizzazione lowercase+trim
 * mantiene la consistenza con il login.
 */
export const passwordRecoverySchema = z
  .object({
    email: z.string().trim().toLowerCase().email('Formato email non valido'),
  })
  .strict();

/**
 * Tipo TypeScript inferito dallo schema di password recovery.
 */
export type PasswordRecoveryInput = z.infer<typeof passwordRecoverySchema>;

/**
 * Validator zod per la richiesta di reset password.
 *
 * Il token e' la stringa ricevuta via link di recovery; la nuova password
 * segue le stesse regole della registrazione.
 */
export const passwordResetSchema = z
  .object({
    token: z.string().min(1, 'Token obbligatorio'),
    newPassword: z
      .string()
      .min(8, 'La password deve contenere almeno 8 caratteri')
      .regex(/[A-Za-z]/, 'La password deve contenere almeno una lettera')
      .regex(/[0-9]/, 'La password deve contenere almeno un numero'),
  })
  .strict();

export type PasswordResetInput = z.infer<typeof passwordResetSchema>;

/**
 * Validator zod per la richiesta di refresh dei token.
 *
 * Accetta il refresh token come stringa non vuota. La validazione
 * crittografica (hash, lookup, scadenza) avviene nel service.
 */
export const refreshTokenSchema = z
  .object({
    refreshToken: z.string().min(1, 'Refresh token obbligatorio'),
  })
  .strict();

/**
 * Tipo TypeScript inferito dallo schema di refresh token.
 */
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;

/**
 * Validator zod per la richiesta di logout.
 *
 * Strutturalmente identica alla richiesta di refresh: il client invia il
 * refresh token che vuole revocare. Tipo separato per chiarezza nei
 * controller e nelle eventuali evoluzioni future del payload.
 */
export const logoutSchema = z
  .object({
    refreshToken: z.string().min(1, 'Refresh token obbligatorio'),
  })
  .strict();

/**
 * Tipo TypeScript inferito dallo schema di logout.
 */
export type LogoutInput = z.infer<typeof logoutSchema>;
