import { Router } from 'express';
import { authenticate, requireRole } from '../../../middleware/auth.middleware';
import { UserRole } from '../../../database/models/User.model';
import {
  registerBusinessHandler,
  getOwnBusinessHandler,
  updateOwnBusinessHandler,
  listOwnOffersHandler,
  createOwnOfferHandler,
  updateOwnOfferHandler,
  archiveOwnOfferHandler,
  listBusinessesHandler,
  approveBusinessHandler,
  rejectBusinessHandler,
  listPublicOffersHandler,
} from '../controllers/business.controller';

/**
 * Crea il router del modulo business.
 *
 * Raggruppa tre famiglie di endpoint:
 *  - self-management dell'attivita (IBusinessSelfMgt): profilo e offerte
 *  - amministrazione affiliazioni (IBusinessAdmin): approva/rifiuta
 *  - vista pubblica delle offerte lato giocatore
 */
export function createBusinessRouter(): Router {
  const router = Router();

  // Registrazione attivita: pubblica, nessuna autenticazione.
  router.post('/business/register', registerBusinessHandler);

  // Profilo dell'attivita autenticata (IBusinessSelfMgt).
  router.get('/business/me', authenticate, requireRole(UserRole.BUSINESS), getOwnBusinessHandler);
  router.patch(
    '/business/me',
    authenticate,
    requireRole(UserRole.BUSINESS),
    updateOwnBusinessHandler,
  );

  // Offerte dell'attivita autenticata (IBusinessSelfMgt, RF29/31/32).
  router.get(
    '/business/offers',
    authenticate,
    requireRole(UserRole.BUSINESS),
    listOwnOffersHandler,
  );
  router.post(
    '/business/offers',
    authenticate,
    requireRole(UserRole.BUSINESS),
    createOwnOfferHandler,
  );
  router.patch(
    '/business/offers/:id',
    authenticate,
    requireRole(UserRole.BUSINESS),
    updateOwnOfferHandler,
  );
  router.delete(
    '/business/offers/:id',
    authenticate,
    requireRole(UserRole.BUSINESS),
    archiveOwnOfferHandler,
  );

  // Amministrazione affiliazioni (IBusinessAdmin, RF38).
  router.get('/admin/businesses', authenticate, requireRole(UserRole.ADMIN), listBusinessesHandler);
  router.post(
    '/admin/businesses/:id/approve',
    authenticate,
    requireRole(UserRole.ADMIN),
    approveBusinessHandler,
  );
  router.post(
    '/admin/businesses/:id/reject',
    authenticate,
    requireRole(UserRole.ADMIN),
    rejectBusinessHandler,
  );

  // Vista pubblica delle offerte (lato giocatore autenticato).
  router.get('/offers', authenticate, listPublicOffersHandler);

  return router;
}
