import { randomUUID } from 'node:crypto';
import { Types } from 'mongoose';
import { Coupon, ICoupon } from '../../../database/models/Coupon.model';
import { Offer, OfferStatus } from '../../../database/models/Offer.model';
import { Player, Business } from '../../../database/models/User.model';
import { listOffersForPlayers } from '../../business/services/business.service';
import {
  NotFoundError,
  ConflictError,
  BadRequestError,
  ForbiddenError,
} from '../../../utils/errors';
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
    businessId: string;
    title: string;
    description: string;
    pointsCost: number;
    status: string;
    createdAt: string;
    remaining: number | null;
    businessName: string;
    businessType: string;
    businessAddress: string;
    businessPosition: { lat: number; lng: number };
  }[]
> {
  const { offers, businessesById } = await listOffersForPlayers();
  return offers.map((o) => {
    const business = businessesById.get(String(o.businessId));
    return {
      id: String(o._id),
      businessId: String(o.businessId),
      title: o.title,
      description: o.description,
      pointsCost: o.pointsCost,
      status: o.status,
      createdAt: o.createdAt.toISOString(),
      remaining: o.remaining,
      businessName: business?.businessName ?? '',
      businessType: business?.businessType ?? 'other',
      businessAddress: business?.address ?? '',
      businessPosition: business
        ? { lat: business.position.coordinates[1], lng: business.position.coordinates[0] }
        : { lat: 0, lng: 0 },
    };
  });
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

  // Decrementa atomicamente totalPoints con condizione per evitare race condition
  const updatedPlayer = await Player.findOneAndUpdate(
    { _id: playerId, totalPoints: { $gte: offer.pointsCost } },
    { $inc: { totalPoints: -offer.pointsCost } },
    { returnDocument: 'after' },
  );

  if (!updatedPlayer) {
    throw new BadRequestError('Punti insufficienti', 'INSUFFICIENT_COINS');
  }

  // Decrementa remaining solo se non è null
  if (offer.remaining !== null) {
    const updated = await Offer.findOneAndUpdate(
      { _id: offerId, status: OfferStatus.ACTIVE, remaining: { $gt: 0 } },
      { $inc: { remaining: -1 } },
      { returnDocument: 'after' },
    );
    if (!updated) {
      // Race condition: offerta esaurita nel frattempo, rimborsa il player
      await Player.updateOne({ _id: playerId }, { $inc: { totalPoints: offer.pointsCost } });
      throw new ConflictError('Offerta esaurita', 'OFFER_SOLD_OUT');
    }
  }

  const token = randomUUID();
  const now = new Date();
  let coupon: ICoupon;
  try {
    coupon = await Coupon.create({
      offerId: offer._id,
      playerId,
      token,
      pointsCost: offer.pointsCost,
      purchasedAt: now,
      expiresAt: new Date(now.getTime() + COUPON_TTL_MS),
    });
  } catch (err) {
    // Compensazione: senza il coupon il giocatore non deve perdere ne'
    // i punti spesi ne' il posto nella disponibilita' dell'offerta.
    await Player.updateOne({ _id: playerId }, { $inc: { totalPoints: offer.pointsCost } });
    if (offer.remaining !== null) {
      await Offer.updateOne({ _id: offerId }, { $inc: { remaining: 1 } });
    }
    throw err;
  }

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

/**
 * Risolve il nome dell'attivita' proprietaria di un'offerta.
 * La pagina di riscatto e' rivolta all'esercente: senza il nome
 * dell'attivita' non puo' verificare che il coupon sia suo.
 */
async function findBusinessName(businessId: Types.ObjectId | undefined): Promise<string> {
  if (!businessId) return '';
  const business = await Business.findById(businessId).select('businessName');
  return business?.businessName ?? '';
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

  const businessName = await findBusinessName(offer?.businessId);

  return {
    coupon: serializeCoupon(coupon, offer?.title ?? '', businessName),
    offerTitle: offer?.title ?? '',
    businessName,
  };
}

/**
 * Transizione atomica active → redeemed di un coupon dato il token.
 *
 * Il filtro su status e scadenza garantisce che due riscatti concorrenti
 * dello stesso token non possano entrambi riuscire (il vecchio findOne +
 * save aveva questa race). In caso di fallimento distingue il motivo
 * (inesistente, gia' riscattato, scaduto) per dare il codice corretto.
 */
async function atomicRedeemByToken(token: string): Promise<ICoupon> {
  const now = new Date();
  const coupon = await Coupon.findOneAndUpdate(
    { token, status: 'active', expiresAt: { $gte: now } },
    { status: 'redeemed', redeemedAt: now },
    { returnDocument: 'after' },
  ).populate('offerId', 'title businessId');

  if (!coupon) {
    const existing = await Coupon.findOne({ token });
    if (!existing) throw new NotFoundError('Coupon non trovato', 'COUPON_NOT_FOUND');
    if (existing.status === 'redeemed') {
      throw new ConflictError('Coupon già riscattato', 'COUPON_ALREADY_REDEEMED');
    }
    throw new ConflictError('Coupon scaduto', 'COUPON_EXPIRED');
  }
  return coupon;
}

export async function redeemCoupon(token: string): Promise<CouponView> {
  const coupon = await atomicRedeemByToken(token);
  const offer = coupon.offerId as unknown as {
    title?: string;
    businessId?: Types.ObjectId;
  } | null;
  const businessName = await findBusinessName(offer?.businessId);
  return serializeCoupon(coupon, offer?.title ?? '', businessName);
}

/* ------------------------------ Lato cassiere --------------------------- */

/**
 * Carica un coupon per token verificando che appartenga a un'offerta
 * dell'attivita' indicata.
 *
 * E' il vincolo di sicurezza del flusso "cassiere": un'attivita' puo'
 * ispezionare o riscattare solo i coupon delle proprie offerte, mai quelli
 * di offerte altrui (403 COUPON_NOT_OWNED).
 */
async function loadOwnedCoupon(
  businessId: string,
  token: string,
): Promise<{ coupon: ICoupon; offerTitle: string; businessName: string }> {
  const coupon = await Coupon.findOne({ token }).populate('offerId', 'title businessId');
  if (!coupon) throw new NotFoundError('Coupon non trovato', 'COUPON_NOT_FOUND');

  const offer = coupon.offerId as unknown as {
    title?: string;
    businessId?: Types.ObjectId;
  } | null;

  if (!offer?.businessId || String(offer.businessId) !== businessId) {
    throw new ForbiddenError(
      "Il coupon non appartiene a un'offerta della tua attivita",
      'COUPON_NOT_OWNED',
    );
  }

  const businessName = await findBusinessName(offer.businessId);
  return { coupon, offerTitle: offer.title ?? '', businessName };
}

/**
 * Verifica un coupon scansionato dal cassiere senza riscattarlo (anteprima).
 *
 * Restituisce lo stato reale del coupon — riallineando ad "expired" quelli
 * scaduti ma ancora marcati active — cosi' l'esercente vede subito se puo'
 * accettarlo prima di confermare il riscatto.
 */
export async function getCouponInfoForBusiness(
  businessId: string,
  token: string,
): Promise<{ coupon: CouponView; offerTitle: string; businessName: string }> {
  const { coupon, offerTitle, businessName } = await loadOwnedCoupon(businessId, token);

  if (coupon.status === 'active' && coupon.expiresAt.getTime() < Date.now()) {
    await Coupon.updateOne({ _id: coupon._id, status: 'active' }, { status: 'expired' });
    coupon.status = 'expired';
  }

  return {
    coupon: serializeCoupon(coupon, offerTitle, businessName),
    offerTitle,
    businessName,
  };
}

/**
 * Riscatta un coupon scansionato dal cassiere (RF: utilizzo offerta).
 *
 * Verifica prima la proprieta' (403 se l'offerta non e' dell'attivita')
 * cosi' un riscatto su coupon altrui non consuma il coupon, poi applica la
 * transizione atomica active → redeemed.
 */
export async function redeemCouponForBusiness(
  businessId: string,
  token: string,
): Promise<CouponView> {
  await loadOwnedCoupon(businessId, token);

  const coupon = await atomicRedeemByToken(token);
  const offer = coupon.offerId as unknown as {
    title?: string;
    businessId?: Types.ObjectId;
  } | null;
  const businessName = await findBusinessName(offer?.businessId);
  return serializeCoupon(coupon, offer?.title ?? '', businessName);
}
