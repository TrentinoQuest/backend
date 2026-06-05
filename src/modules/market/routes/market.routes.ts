import { Router } from 'express';
import { authenticate, requireRole } from '../../../middleware/auth.middleware';
import { UserRole } from '../../../database/models/User.model';
import {
  listOffersHandler,
  purchaseOfferHandler,
  getMyCouponsHandler,
  getRedeemInfoHandler,
  redeemCouponHandler,
} from '../controllers/market.controller';

export function createMarketRouter(): Router {
  const router = Router();

  // Endpoint autenticati (player)
  router.get('/market/offers', authenticate, requireRole(UserRole.PLAYER), listOffersHandler);
  router.post(
    '/market/purchase/:offerId',
    authenticate,
    requireRole(UserRole.PLAYER),
    purchaseOfferHandler,
  );
  router.get('/market/my-coupons', authenticate, requireRole(UserRole.PLAYER), getMyCouponsHandler);

  // Endpoint pubblici per esercenti (nessuna auth JWT)
  router.get('/market/redeem/:token', getRedeemInfoHandler);
  router.post('/market/redeem/:token', redeemCouponHandler);

  return router;
}
