import { Router } from 'express';
import { authenticate } from '../../../middleware/auth.middleware';
import {
  registerHandler,
  loginHandler,
  logoutHandler,
  passwordRecoveryHandler,
} from '../controllers/auth.controller';

/**
 * Crea il router con gli endpoint del modulo auth.
 *
 * Implementa l'interfaccia IAuth dichiarata nel Deliverable D2 e
 * documentata nello schema OpenAPI sotto il tag "auth".
 *
 * Endpoint pubblici (no JWT richiesto):
 * - POST /register
 * - POST /login
 * - POST /password-recovery
 *
 * Endpoint protetti (JWT richiesto):
 * - POST /logout
 */
export function createAuthRouter(): Router {
  const router = Router();

  router.post('/register', registerHandler);
  router.post('/login', loginHandler);
  router.post('/password-recovery', passwordRecoveryHandler);
  router.post('/logout', authenticate, logoutHandler);

  return router;
}
