import { Router } from 'express';
import {
  registerHandler,
  loginHandler,
  logoutHandler,
  refreshHandler,
  passwordRecoveryHandler,
} from '../controllers/auth.controller';

/**
 * Crea il router con gli endpoint del modulo auth.
 *
 * Implementa l'interfaccia IAuth dichiarata nel Deliverable D2 e
 * documentata nello schema OpenAPI sotto il tag "auth".
 *
 * Tutti gli endpoint sono pubblici (no access token richiesto):
 * - POST /register: registrazione di un nuovo Giocatore
 * - POST /login: autenticazione, ritorna access+refresh
 * - POST /refresh: rinnovo della coppia di token con rotation
 * - POST /logout: revoca del refresh token
 * - POST /password-recovery: avvio del recovery password
 *
 * Logout non richiede authenticate perche' la sicurezza e' garantita
 * dal possesso del refresh token: chi puo' presentarne uno valido ha
 * legittima titolarita' a revocarlo.
 */
export function createAuthRouter(): Router {
  const router = Router();

  router.post('/register', registerHandler);
  router.post('/login', loginHandler);
  router.post('/refresh', refreshHandler);
  router.post('/logout', logoutHandler);
  router.post('/password-recovery', passwordRecoveryHandler);

  return router;
}
