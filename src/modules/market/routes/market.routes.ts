import { Router } from 'express';
import { authenticate, requireRole } from '../../../middleware/auth.middleware';
import { redeemRateLimiter } from '../../../middleware/rate-limit';
import { UserRole } from '../../../database/models/User.model';
import {
  listOffersHandler,
  purchaseOfferHandler,
  getMyCouponsHandler,
  getRedeemInfoHandler,
  redeemCouponHandler,
  getCouponInfoForBusinessHandler,
  redeemCouponForBusinessHandler,
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

  // Endpoint pubblici per esercenti (nessuna auth JWT, rate limited
  // per impedire il brute force sui token)
  router.get('/market/redeem/:token', redeemRateLimiter, getRedeemInfoHandler);
  router.post('/market/redeem/:token', redeemRateLimiter, redeemCouponHandler);

  // Lato cassiere: l'attivita autenticata scansiona il QR del coupon, ne
  // verifica la validita e lo riscatta, solo se appartiene a una propria
  // offerta (vincolo di proprieta lato service).
  router.get(
    '/market/business/redeem/:token',
    authenticate,
    requireRole(UserRole.BUSINESS),
    getCouponInfoForBusinessHandler,
  );
  router.post(
    '/market/business/redeem/:token',
    authenticate,
    requireRole(UserRole.BUSINESS),
    redeemCouponForBusinessHandler,
  );

  return router;
}
