import { Request, Response, NextFunction } from 'express';
import {
  listOffersForMarket,
  purchaseOffer,
  getMyCoupons,
  getRedeemInfo,
  getCouponInfoForBusiness,
  redeemCouponForBusiness,
} from '../services/market.service';
import { UnauthorizedError } from '../../../utils/errors';

export async function listOffersHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw new UnauthorizedError('Autenticazione richiesta', 'AUTH_REQUIRED');
    const offers = await listOffersForMarket();
    res.status(200).json(offers);
  } catch (err) {
    next(err);
  }
}

export async function purchaseOfferHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw new UnauthorizedError('Autenticazione richiesta', 'AUTH_REQUIRED');
    const coupon = await purchaseOffer(String(req.user._id), String(req.params.offerId));
    res.status(201).json(coupon);
  } catch (err) {
    next(err);
  }
}

export async function getMyCouponsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw new UnauthorizedError('Autenticazione richiesta', 'AUTH_REQUIRED');
    const coupons = await getMyCoupons(String(req.user._id));
    res.status(200).json(coupons);
  } catch (err) {
    next(err);
  }
}

// Endpoint pubblico — nessuna autenticazione JWT
export async function getRedeemInfoHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await getRedeemInfo(String(req.params.token));
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

// Lato cassiere — attivita autenticata: verifica un coupon scansionato
// senza riscattarlo, solo se appartiene a una propria offerta.
export async function getCouponInfoForBusinessHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw new UnauthorizedError('Autenticazione richiesta', 'AUTH_REQUIRED');
    const result = await getCouponInfoForBusiness(String(req.user._id), String(req.params.token));
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

// Lato cassiere — attivita autenticata: riscatta un coupon scansionato,
// previa verifica che appartenga a una propria offerta.
export async function redeemCouponForBusinessHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw new UnauthorizedError('Autenticazione richiesta', 'AUTH_REQUIRED');
    const coupon = await redeemCouponForBusiness(String(req.user._id), String(req.params.token));
    res.status(200).json(coupon);
  } catch (err) {
    next(err);
  }
}
