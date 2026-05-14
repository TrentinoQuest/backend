import { Router } from 'express';
import { authenticate, requireRole } from '../../../middleware/auth.middleware';
import { UserRole } from '../../../database/models/User.model';
import {
  listQuestsHandler,
  getQuestByIdHandler,
  checkInHandler,
  scanQrHandler,
} from '../controllers/quest-completion.controller';
import {
  getPlayerMeHandler,
  listPlayerCompletionsHandler,
  getPlayerCollectionHandler,
  getPlayerProgressHandler,
} from '../controllers/player-profile.controller';

/**
 * Crea il router con gli endpoint del modulo quests, parte player-side.
 *
 * Implementa due interfacce del Deliverable D2:
 * - IQuestCompletion: visualizzazione mappa, dettagli, check-in, scan QR
 * - IPlayerProfile: profilo, completamenti, album, progress
 *
 * Tutti gli endpoint richiedono autenticazione e, per gli endpoint del
 * profilo player, ruolo PLAYER. Le quest sono visibili a tutti gli
 * utenti autenticati (anche admin/business per finalita' di anteprima),
 * ma il completamento e' riservato ai giocatori.
 */
export function createQuestsRouter(): Router {
  const router = Router();

  // IQuestCompletion - visibilita' aperta a tutti i ruoli autenticati
  router.get('/quests', authenticate, listQuestsHandler);
  router.get('/quests/:id', authenticate, getQuestByIdHandler);

  // IQuestCompletion - completamento riservato ai giocatori
  router.post('/quests/:id/check-in', authenticate, requireRole(UserRole.PLAYER), checkInHandler);
  router.post('/quests/:id/scan', authenticate, requireRole(UserRole.PLAYER), scanQrHandler);

  // IPlayerProfile - riservata ai giocatori
  router.get('/player/me', authenticate, requireRole(UserRole.PLAYER), getPlayerMeHandler);
  router.get(
    '/player/completions',
    authenticate,
    requireRole(UserRole.PLAYER),
    listPlayerCompletionsHandler,
  );
  router.get(
    '/player/collection',
    authenticate,
    requireRole(UserRole.PLAYER),
    getPlayerCollectionHandler,
  );
  router.get(
    '/player/progress',
    authenticate,
    requireRole(UserRole.PLAYER),
    getPlayerProgressHandler,
  );

  return router;
}
