import { describe, it, expect } from 'vitest';
import { registerPlayer } from '../../src/modules/auth/services/auth.service';
import {
  purchaseOffer,
  getMyCoupons,
  redeemCoupon,
} from '../../src/modules/market/services/market.service';
import { Offer, OfferStatus } from '../../src/database/models/Offer.model';
import { Coupon } from '../../src/database/models/Coupon.model';
import { Player, Business } from '../../src/database/models/User.model';
import { BusinessType, BusinessApprovalStatus } from '@trentino-quest/shared-types';
import { Types } from 'mongoose';

async function createPlayer(suffix = ''): Promise<string> {
  const ts = Date.now() + suffix;
  const { user } = await registerPlayer({
    email: `market${ts}@test.com`,
    password: 'Password123',
    username: `mp${ts}`,
  });
  return user.id as string;
}

async function createBusiness(suffix = ''): Promise<Types.ObjectId> {
  const ts = Date.now() + suffix;
  const b = await Business.create({
    email: `biz${ts}@test.com`,
    password: 'BizPass123',
    businessName: `Rifugio ${ts}`,
    businessType: BusinessType.MOUNTAIN_HUT,
    address: 'Via Test 1',
    position: { type: 'Point', coordinates: [11.0, 46.0] },
    approvalStatus: BusinessApprovalStatus.APPROVED,
  });
  return b._id;
}

async function createOffer(
  businessId: Types.ObjectId,
  pointsCost: number,
  remaining: number | null = null,
): Promise<string> {
  const offer = await Offer.create({
    businessId,
    title: 'Offerta Test',
    description: 'Descrizione test',
    pointsCost,
    remaining,
    status: OfferStatus.ACTIVE,
  });
  return String(offer._id);
}

// ── purchaseOffer ─────────────────────────────────────────────────────────────

describe('purchaseOffer', () => {
  it('lancia NotFoundError per offerId non valido', async () => {
    const playerId = await createPlayer('a');
    await expect(purchaseOffer(playerId, 'invalid-id')).rejects.toMatchObject({
      code: 'OFFER_NOT_FOUND',
    });
  });

  it('lancia NotFoundError per offerta inesistente', async () => {
    const playerId = await createPlayer('b');
    const fakeId = new Types.ObjectId().toHexString();
    await expect(purchaseOffer(playerId, fakeId)).rejects.toMatchObject({
      code: 'OFFER_NOT_FOUND',
    });
  });

  it('lancia BadRequestError INSUFFICIENT_COINS se il player non ha abbastanza coins', async () => {
    const playerId = await createPlayer('c');
    const bizId = await createBusiness('c');
    const offerId = await createOffer(bizId, 300);
    await Player.findByIdAndUpdate(playerId, { coins: 100 });

    await expect(purchaseOffer(playerId, offerId)).rejects.toMatchObject({
      code: 'INSUFFICIENT_COINS',
    });
  });

  it("lancia ConflictError OFFER_SOLD_OUT se l'offerta è esaurita", async () => {
    const playerId = await createPlayer('d');
    const bizId = await createBusiness('d');
    const offerId = await createOffer(bizId, 50, 0);
    await Player.findByIdAndUpdate(playerId, { coins: 500 });

    await expect(purchaseOffer(playerId, offerId)).rejects.toMatchObject({
      code: 'OFFER_SOLD_OUT',
    });
  });

  it('acquisto riuscito: crea coupon con token e scadenza 48h', async () => {
    const playerId = await createPlayer('e');
    const bizId = await createBusiness('e');
    const offerId = await createOffer(bizId, 100);
    await Player.findByIdAndUpdate(playerId, { coins: 500 });

    const couponView = await purchaseOffer(playerId, offerId);
    expect(couponView.token).toBeTruthy();
    expect(couponView.status).toBe('active');
    expect(couponView.pointsCost).toBe(100);

    const expiresAt = new Date(couponView.expiresAt).getTime();
    const purchasedAt = new Date(couponView.purchasedAt).getTime();
    const diff = expiresAt - purchasedAt;
    const fortyEightHours = 48 * 60 * 60 * 1000;
    expect(diff).toBeGreaterThan(fortyEightHours - 5000);
    expect(diff).toBeLessThan(fortyEightHours + 5000);
  });

  it('acquisto riuscito: decrementa i coins del player', async () => {
    const playerId = await createPlayer('f');
    const bizId = await createBusiness('f');
    const offerId = await createOffer(bizId, 150);
    await Player.findByIdAndUpdate(playerId, { coins: 500 });

    await purchaseOffer(playerId, offerId);
    const updated = await Player.findById(playerId);
    expect(updated?.coins).toBe(350);
  });

  it("acquisto riuscito: decrementa remaining dell'offerta se non null", async () => {
    const playerId = await createPlayer('g');
    const bizId = await createBusiness('g');
    const offerId = await createOffer(bizId, 50, 10);
    await Player.findByIdAndUpdate(playerId, { coins: 500 });

    await purchaseOffer(playerId, offerId);
    const offer = await Offer.findById(offerId);
    expect(offer?.remaining).toBe(9);
  });

  it('acquisto riuscito: remaining null rimane null (illimitato)', async () => {
    const playerId = await createPlayer('h');
    const bizId = await createBusiness('h');
    const offerId = await createOffer(bizId, 50, null);
    await Player.findByIdAndUpdate(playerId, { coins: 500 });

    await purchaseOffer(playerId, offerId);
    const offer = await Offer.findById(offerId);
    expect(offer?.remaining).toBeNull();
  });
});

// ── redeemCoupon ──────────────────────────────────────────────────────────────

describe('redeemCoupon', () => {
  it('lancia NotFoundError COUPON_NOT_FOUND per token inesistente', async () => {
    await expect(redeemCoupon('token-inesistente')).rejects.toMatchObject({
      code: 'COUPON_NOT_FOUND',
    });
  });

  it('riscatta un coupon attivo e cambia status a redeemed', async () => {
    const playerId = await createPlayer('i');
    const bizId = await createBusiness('i');
    const offerId = await createOffer(bizId, 50);
    await Player.findByIdAndUpdate(playerId, { coins: 500 });
    const couponView = await purchaseOffer(playerId, offerId);

    const redeemed = await redeemCoupon(couponView.token);
    expect(redeemed.status).toBe('redeemed');
    expect(redeemed.redeemedAt).not.toBeNull();
  });

  it('lancia ConflictError COUPON_ALREADY_REDEEMED per coupon già riscattato', async () => {
    const playerId = await createPlayer('j');
    const bizId = await createBusiness('j');
    const offerId = await createOffer(bizId, 50);
    await Player.findByIdAndUpdate(playerId, { coins: 500 });
    const couponView = await purchaseOffer(playerId, offerId);

    await redeemCoupon(couponView.token);
    await expect(redeemCoupon(couponView.token)).rejects.toMatchObject({
      code: 'COUPON_ALREADY_REDEEMED',
    });
  });

  it('lancia ConflictError COUPON_EXPIRED per coupon scaduto', async () => {
    const playerId = await createPlayer('k');
    const bizId = await createBusiness('k');
    const offerId = await createOffer(bizId, 50);
    await Player.findByIdAndUpdate(playerId, { coins: 500 });
    const couponView = await purchaseOffer(playerId, offerId);

    // Simula scadenza
    await Coupon.findOneAndUpdate(
      { token: couponView.token },
      { expiresAt: new Date(Date.now() - 1000) },
    );

    await expect(redeemCoupon(couponView.token)).rejects.toMatchObject({
      code: 'COUPON_EXPIRED',
    });
  });
});

// ── getMyCoupons ──────────────────────────────────────────────────────────────

describe('getMyCoupons', () => {
  it('restituisce lista vuota se il player non ha coupon', async () => {
    const playerId = await createPlayer('l');
    const coupons = await getMyCoupons(playerId);
    expect(coupons).toEqual([]);
  });

  it('restituisce i coupon del player', async () => {
    const playerId = await createPlayer('m');
    const bizId = await createBusiness('m');
    const offerId = await createOffer(bizId, 50);
    await Player.findByIdAndUpdate(playerId, { coins: 500 });
    await purchaseOffer(playerId, offerId);

    const coupons = await getMyCoupons(playerId);
    expect(coupons).toHaveLength(1);
    expect(coupons[0].status).toBe('active');
  });

  it('aggiorna automaticamente status a expired per coupon scaduti', async () => {
    const playerId = await createPlayer('n');
    const bizId = await createBusiness('n');
    const offerId = await createOffer(bizId, 50);
    await Player.findByIdAndUpdate(playerId, { coins: 500 });
    const couponView = await purchaseOffer(playerId, offerId);

    // Simula scadenza
    await Coupon.findOneAndUpdate(
      { token: couponView.token },
      { expiresAt: new Date(Date.now() - 1000) },
    );

    const coupons = await getMyCoupons(playerId);
    expect(coupons[0].status).toBe('expired');
  });
});
