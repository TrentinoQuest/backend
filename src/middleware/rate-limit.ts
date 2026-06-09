import rateLimit from 'express-rate-limit';
import { env } from '../config/env';

/**
 * Rate limiting per gli endpoint sensibili.
 *
 * Protegge da brute force sulle credenziali, spam di registrazioni,
 * enumeration sul recovery password e tentativi di indovinare i token
 * dei coupon. I limiti sono per IP e volutamente generosi per non
 * penalizzare l'uso legittimo da reti condivise (es. WiFi pubblico).
 *
 * In ambiente test il limite e' disattivato per non interferire con le
 * suite automatizzate che effettuano molte richieste in rapida sequenza.
 */

const skipInTest = (): boolean => env.NODE_ENV === 'test';

/**
 * Limiter per login, register, recovery e OAuth: 20 richieste per IP
 * ogni 15 minuti. Sufficiente per ogni uso legittimo, blocca il brute
 * force sistematico.
 */
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTest,
  message: { code: 'RATE_LIMITED', message: 'Troppe richieste, riprova più tardi' },
});

/**
 * Limiter per il riscatto coupon pubblico: 30 richieste per IP al minuto.
 * Un esercente legittimo scansiona pochi coupon al minuto; questo blocca
 * il brute force sui token.
 */
export const redeemRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTest,
  message: { code: 'RATE_LIMITED', message: 'Troppe richieste, riprova più tardi' },
});
