import { randomUUID } from 'node:crypto';
import { Types } from 'mongoose';
import { Coupon, ICoupon } from '../../../database/models/Coupon.model';
import { Offer, OfferStatus } from '../../../database/models/Offer.model';
import { Player } from '../../../database/models/User.model';
import { listOffersForPlayers } from '../../business/services/business.service';
import { NotFoundError, ConflictError, BadRequestError } from '../../../utils/errors';
import { CouponView } from '@trentino-quest/shared-types';

const COUPON_TTL_MS = 48 * 60 * 60 * 1000;

function serializeCoupon(coupon: ICoupon, offerTitle?: string, businessName?: string): CouponView {
  return {
    id: String(coupon._id),
    offerId: String(coupon.offerId),
    offerTitle: offerTitle ?? '',
    businessName: businessName ?? '',
    token: coupon.token,
    pointsCost: coupon.pointsCost,
    status: coupon.status,
    purchasedAt: coupon.purchasedAt.toISOString(),
    expiresAt: coupon.expiresAt.toISOString(),
    redeemedAt: coupon.redeemedAt?.toISOString() ?? null,
  };
}

export async function listOffersForMarket(): Promise<
  {
    id: string;
    title: string;
    description: string;
    pointsCost: number;
    remaining: number | null;
    businessName: string;
  }[]
> {
  const { offers, businessesById } = await listOffersForPlayers();
  return offers.map((o) => ({
    id: String(o._id),
    title: o.title,
    description: o.description,
    pointsCost: o.pointsCost,
    remaining: o.remaining,
    businessName: businessesById.get(String(o.businessId))?.businessName ?? '',
  }));
}

export async function purchaseOffer(playerId: string, offerId: string): Promise<CouponView> {
  if (!Types.ObjectId.isValid(offerId)) {
    throw new NotFoundError('Offerta non trovata', 'OFFER_NOT_FOUND');
  }

  const offer = await Offer.findOne({ _id: offerId, status: OfferStatus.ACTIVE });
  if (!offer) throw new NotFoundError('Offerta non trovata', 'OFFER_NOT_FOUND');

  if (offer.remaining !== null && offer.remaining <= 0) {
    throw new ConflictError('Offerta esaurita', 'OFFER_SOLD_OUT');
  }

  // Decrementa atomicamente coins e remaining con condizione per evitare race condition
  const updatedPlayer = await Player.findOneAndUpdate(
    { _id: playerId, coins: { $gte: offer.pointsCost } },
    { $inc: { coins: -offer.pointsCost } },
    { new: true },
  );

  if (!updatedPlayer) {
    throw new BadRequestError('Coins insufficienti', 'INSUFFICIENT_COINS');
  }

  // Decrementa remaining solo se non è null
  if (offer.remaining !== null) {
    const updated = await Offer.findOneAndUpdate(
      { _id: offerId, status: OfferStatus.ACTIVE, remaining: { $gt: 0 } },
      { $inc: { remaining: -1 } },
      { new: true },
    );
    if (!updated) {
      // Race condition: offerta esaurita nel frattempo, rimborsa il player
      await Player.updateOne({ _id: playerId }, { $inc: { coins: offer.pointsCost } });
      throw new ConflictError('Offerta esaurita', 'OFFER_SOLD_OUT');
    }
  }

  const token = randomUUID();
  const now = new Date();
  const coupon = await Coupon.create({
    offerId: offer._id,
    playerId,
    token,
    pointsCost: offer.pointsCost,
    purchasedAt: now,
    expiresAt: new Date(now.getTime() + COUPON_TTL_MS),
  });

  return serializeCoupon(coupon, offer.title);
}

export async function getMyCoupons(playerId: string): Promise<CouponView[]> {
  const now = new Date();

  // Segna come expired quelli scaduti con status active
  await Coupon.updateMany(
    { playerId, status: 'active', expiresAt: { $lt: now } },
    { status: 'expired' },
  );

  const coupons = await Coupon.find({ playerId })
    .populate('offerId', 'title')
    .sort({ purchasedAt: -1 });

  return coupons.map((c) => {
    const offer = c.offerId as unknown as { title?: string } | null;
    return serializeCoupon(c, offer?.title ?? '');
  });
}

export async function getRedeemInfo(token: string): Promise<{
  coupon: CouponView;
  offerTitle: string;
  businessName: string;
}> {
  const coupon = await Coupon.findOne({ token }).populate('offerId');
  if (!coupon) throw new NotFoundError('Coupon non trovato', 'COUPON_NOT_FOUND');

  const offer = coupon.offerId as unknown as {
    _id: unknown;
    title: string;
    businessId?: Types.ObjectId;
  } | null;

  return {
    coupon: serializeCoupon(coupon, offer?.title ?? ''),
    offerTitle: offer?.title ?? '',
    businessName: '',
  };
}

export async function redeemCoupon(token: string): Promise<CouponView> {
  const now = new Date();
  const coupon = await Coupon.findOne({ token }).populate('offerId', 'title');
  if (!coupon) throw new NotFoundError('Coupon non trovato', 'COUPON_NOT_FOUND');

  if (coupon.status === 'redeemed') {
    throw new ConflictError('Coupon già riscattato', 'COUPON_ALREADY_REDEEMED');
  }
  if (coupon.status === 'expired' || coupon.expiresAt < now) {
    throw new ConflictError('Coupon scaduto', 'COUPON_EXPIRED');
  }

  coupon.status = 'redeemed';
  coupon.redeemedAt = now;
  await coupon.save();

  const offer = coupon.offerId as unknown as { title?: string } | null;
  return serializeCoupon(coupon, offer?.title ?? '');
}
