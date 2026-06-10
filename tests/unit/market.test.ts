import { describe, it, expect } from 'vitest';
import { registerPlayer } from '../../src/modules/auth/services/auth.service';
import {
  purchaseOffer,
  getMyCoupons,
  getRedeemInfo,
  getCouponInfoForBusiness,
  redeemCouponForBusiness,
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
    await Player.findByIdAndUpdate(playerId, { totalPoints: 100 });

    await expect(purchaseOffer(playerId, offerId)).rejects.toMatchObject({
      code: 'INSUFFICIENT_COINS',
    });
  });

  it("lancia ConflictError OFFER_SOLD_OUT se l'offerta è esaurita", async () => {
    const playerId = await createPlayer('d');
    const bizId = await createBusiness('d');
    const offerId = await createOffer(bizId, 50, 0);
    await Player.findByIdAndUpdate(playerId, { totalPoints: 500 });

    await expect(purchaseOffer(playerId, offerId)).rejects.toMatchObject({
      code: 'OFFER_SOLD_OUT',
    });
  });

  it('acquisto riuscito: crea coupon con token e scadenza 48h', async () => {
    const playerId = await createPlayer('e');
    const bizId = await createBusiness('e');
    const offerId = await createOffer(bizId, 100);
    await Player.findByIdAndUpdate(playerId, { totalPoints: 500 });

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

  it('acquisto riuscito: decrementa i totalPoints del player', async () => {
    const playerId = await createPlayer('f');
    const bizId = await createBusiness('f');
    const offerId = await createOffer(bizId, 150);
    await Player.findByIdAndUpdate(playerId, { totalPoints: 500 });

    await purchaseOffer(playerId, offerId);
    const updated = await Player.findById(playerId);
    expect(updated?.totalPoints).toBe(350);
  });

  it("acquisto riuscito: decrementa remaining dell'offerta se non null", async () => {
    const playerId = await createPlayer('g');
    const bizId = await createBusiness('g');
    const offerId = await createOffer(bizId, 50, 10);
    await Player.findByIdAndUpdate(playerId, { totalPoints: 500 });

    await purchaseOffer(playerId, offerId);
    const offer = await Offer.findById(offerId);
    expect(offer?.remaining).toBe(9);
  });

  it('acquisto riuscito: remaining null rimane null (illimitato)', async () => {
    const playerId = await createPlayer('h');
    const bizId = await createBusiness('h');
    const offerId = await createOffer(bizId, 50, null);
    await Player.findByIdAndUpdate(playerId, { totalPoints: 500 });

    await purchaseOffer(playerId, offerId);
    const offer = await Offer.findById(offerId);
    expect(offer?.remaining).toBeNull();
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
    await Player.findByIdAndUpdate(playerId, { totalPoints: 500 });
    await purchaseOffer(playerId, offerId);

    const coupons = await getMyCoupons(playerId);
    expect(coupons).toHaveLength(1);
    expect(coupons[0].status).toBe('active');
  });

  it('aggiorna automaticamente status a expired per coupon scaduti', async () => {
    const playerId = await createPlayer('n');
    const bizId = await createBusiness('n');
    const offerId = await createOffer(bizId, 50);
    await Player.findByIdAndUpdate(playerId, { totalPoints: 500 });
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

// ── getRedeemInfo (anteprima pubblica esercente) ──────────────────────────────

describe('getRedeemInfo', () => {
  it('getRedeemInfo espone il nome della attività per la pagina esercente', async () => {
    const playerId = await createPlayer('bn2');
    const bizId = await createBusiness('bn2');
    const offerId = await createOffer(bizId, 10);
    await Player.findByIdAndUpdate(playerId, { totalPoints: 100 });
    const coupon = await purchaseOffer(playerId, offerId);

    const info = await getRedeemInfo(coupon.token);

    expect(info.businessName).not.toBe('');
    expect(info.token).toBe(coupon.token);
    expect(info.status).toBe('active');
  });
});

// ── Lato cassiere: verifica e riscatto con vincolo di proprietà ───────────────

describe('getCouponInfoForBusiness', () => {
  it('lancia NotFoundError COUPON_NOT_FOUND per token inesistente', async () => {
    const bizId = await createBusiness('ci0');
    await expect(
      getCouponInfoForBusiness(String(bizId), 'token-inesistente'),
    ).rejects.toMatchObject({ code: 'COUPON_NOT_FOUND' });
  });

  it("lancia ForbiddenError COUPON_NOT_OWNED se il coupon è di un'altra attività", async () => {
    const playerId = await createPlayer('ci1');
    const ownerBiz = await createBusiness('ci1-owner');
    const otherBiz = await createBusiness('ci1-other');
    const offerId = await createOffer(ownerBiz, 10);
    await Player.findByIdAndUpdate(playerId, { totalPoints: 100 });
    const coupon = await purchaseOffer(playerId, offerId);

    await expect(getCouponInfoForBusiness(String(otherBiz), coupon.token)).rejects.toMatchObject({
      code: 'COUPON_NOT_OWNED',
    });
  });

  it('restituisce le info del coupon attivo per la propria attività senza riscattarlo', async () => {
    const playerId = await createPlayer('ci2');
    const bizId = await createBusiness('ci2');
    const offerId = await createOffer(bizId, 10);
    await Player.findByIdAndUpdate(playerId, { totalPoints: 100 });
    const coupon = await purchaseOffer(playerId, offerId);

    const info = await getCouponInfoForBusiness(String(bizId), coupon.token);
    expect(info.status).toBe('active');
    expect(info.businessName).not.toBe('');

    // Non deve aver consumato il coupon: resta riscattabile.
    const stored = await Coupon.findOne({ token: coupon.token });
    expect(stored?.status).toBe('active');
  });

  it('riallinea a expired un coupon scaduto ancora marcato active', async () => {
    const playerId = await createPlayer('ci3');
    const bizId = await createBusiness('ci3');
    const offerId = await createOffer(bizId, 10);
    await Player.findByIdAndUpdate(playerId, { totalPoints: 100 });
    const coupon = await purchaseOffer(playerId, offerId);
    await Coupon.findOneAndUpdate(
      { token: coupon.token },
      { expiresAt: new Date(Date.now() - 1000) },
    );

    const info = await getCouponInfoForBusiness(String(bizId), coupon.token);
    expect(info.status).toBe('expired');
  });
});

describe('redeemCouponForBusiness', () => {
  it('lancia ForbiddenError COUPON_NOT_OWNED senza consumare il coupon altrui', async () => {
    const playerId = await createPlayer('rb1');
    const ownerBiz = await createBusiness('rb1-owner');
    const otherBiz = await createBusiness('rb1-other');
    const offerId = await createOffer(ownerBiz, 10);
    await Player.findByIdAndUpdate(playerId, { totalPoints: 100 });
    const coupon = await purchaseOffer(playerId, offerId);

    await expect(redeemCouponForBusiness(String(otherBiz), coupon.token)).rejects.toMatchObject({
      code: 'COUPON_NOT_OWNED',
    });

    // Il coupon non deve essere stato riscattato dal tentativo non autorizzato.
    const stored = await Coupon.findOne({ token: coupon.token });
    expect(stored?.status).toBe('active');
  });

  it('riscatta un coupon della propria attività', async () => {
    const playerId = await createPlayer('rb2');
    const bizId = await createBusiness('rb2');
    const offerId = await createOffer(bizId, 10);
    await Player.findByIdAndUpdate(playerId, { totalPoints: 100 });
    const coupon = await purchaseOffer(playerId, offerId);

    const redeemed = await redeemCouponForBusiness(String(bizId), coupon.token);
    expect(redeemed.status).toBe('redeemed');
    expect(redeemed.redeemedAt).not.toBeNull();
    expect(redeemed.businessName).not.toBe('');
  });

  it('lancia ConflictError COUPON_ALREADY_REDEEMED al secondo riscatto', async () => {
    const playerId = await createPlayer('rb3');
    const bizId = await createBusiness('rb3');
    const offerId = await createOffer(bizId, 10);
    await Player.findByIdAndUpdate(playerId, { totalPoints: 100 });
    const coupon = await purchaseOffer(playerId, offerId);

    await redeemCouponForBusiness(String(bizId), coupon.token);
    await expect(redeemCouponForBusiness(String(bizId), coupon.token)).rejects.toMatchObject({
      code: 'COUPON_ALREADY_REDEEMED',
    });
  });

  it('lancia ConflictError COUPON_EXPIRED per coupon scaduto', async () => {
    const playerId = await createPlayer('rb4');
    const bizId = await createBusiness('rb4');
    const offerId = await createOffer(bizId, 10);
    await Player.findByIdAndUpdate(playerId, { totalPoints: 100 });
    const coupon = await purchaseOffer(playerId, offerId);
    await Coupon.findOneAndUpdate(
      { token: coupon.token },
      { expiresAt: new Date(Date.now() - 1000) },
    );

    await expect(redeemCouponForBusiness(String(bizId), coupon.token)).rejects.toMatchObject({
      code: 'COUPON_EXPIRED',
    });
  });

  // Atomicità: il riscatto è un update condizionato su status='active',
  // quindi due scansioni quasi simultanee dello stesso coupon non possono
  // entrambe andare a buon fine (no doppia attivazione).
  it('due riscatti concorrenti dello stesso token: uno solo riesce', async () => {
    const playerId = await createPlayer('rb5');
    const bizId = await createBusiness('rb5');
    const offerId = await createOffer(bizId, 10);
    await Player.findByIdAndUpdate(playerId, { totalPoints: 100 });
    const coupon = await purchaseOffer(playerId, offerId);

    const results = await Promise.allSettled([
      redeemCouponForBusiness(String(bizId), coupon.token),
      redeemCouponForBusiness(String(bizId), coupon.token),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toMatchObject({
      code: 'COUPON_ALREADY_REDEEMED',
    });
  });
});
