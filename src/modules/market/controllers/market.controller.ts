import { Request, Response, NextFunction } from 'express';
import {
  listOffersForMarket,
  purchaseOffer,
  getMyCoupons,
  getRedeemInfo,
  redeemCoupon,
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
    res.status(200).json({ data: offers });
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
    res.status(201).json({ data: coupon });
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
    res.status(200).json({ data: coupons });
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
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

// Endpoint pubblico — nessuna autenticazione JWT
export async function redeemCouponHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const coupon = await redeemCoupon(String(req.params.token));
    res.status(200).json({ data: coupon });
  } catch (err) {
    next(err);
  }
}
