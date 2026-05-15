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
import {
  listAdminQuestsHandler,
  getAdminQuestByIdHandler,
  createAdminQuestHandler,
  updateAdminQuestHandler,
  archiveAdminQuestHandler,
  activateAdminQuestHandler,
  deactivateAdminQuestHandler,
} from '../controllers/quest-admin.controller';

/**
 * Crea il router con gli endpoint del modulo quests.
 *
 * Implementa tre interfacce del Deliverable D2:
 * - IQuestCompletion: visualizzazione mappa, dettagli, check-in, scan QR
 * - IPlayerProfile: profilo, completamenti, album, progress
 * - IQuestAdmin: CRUD quest dal pannello amministrativo
 *
 * La separazione tra endpoint pubblici (sotto /quests e /player) ed
 * endpoint amministrativi (sotto /admin/quests) e' garantita dai prefissi
 * di path e dal middleware requireRole(ADMIN) sugli endpoint admin.
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

  // IQuestAdmin - tutte riservate agli amministratori
  router.get('/admin/quests', authenticate, requireRole(UserRole.ADMIN), listAdminQuestsHandler);
  router.get(
    '/admin/quests/:id',
    authenticate,
    requireRole(UserRole.ADMIN),
    getAdminQuestByIdHandler,
  );
  router.post('/admin/quests', authenticate, requireRole(UserRole.ADMIN), createAdminQuestHandler);
  router.patch(
    '/admin/quests/:id',
    authenticate,
    requireRole(UserRole.ADMIN),
    updateAdminQuestHandler,
  );
  router.delete(
    '/admin/quests/:id',
    authenticate,
    requireRole(UserRole.ADMIN),
    archiveAdminQuestHandler,
  );
  router.post(
    '/admin/quests/:id/activate',
    authenticate,
    requireRole(UserRole.ADMIN),
    activateAdminQuestHandler,
  );
  router.post(
    '/admin/quests/:id/deactivate',
    authenticate,
    requireRole(UserRole.ADMIN),
    deactivateAdminQuestHandler,
  );

  return router;
}
