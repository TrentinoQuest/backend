import { describe, it, expect } from 'vitest';
import { registerPlayer } from '../../src/modules/auth/services/auth.service';
import {
  createCoopChallenge,
  getActiveChallenges,
  getChallengeById,
  addProgress,
  nudgePartner,
} from '../../src/modules/coop/services/coop.service';
import { Friendship } from '../../src/database/models/Friendship.model';
import { CoopChallengeType, CoopChallenge } from '../../src/database/models/CoopChallenge.model';
import { Types } from 'mongoose';

async function createPlayer(suffix = ''): Promise<string> {
  const ts = Date.now() + suffix;
  const { user } = await registerPlayer({
    email: `coop${ts}@test.com`,
    password: 'Password123',
    username: `coopplayer${ts}`,
  });
  return user.id as string;
}

async function makeFriends(p1: string, p2: string): Promise<void> {
  await Friendship.create({ requesterId: p1, recipientId: p2, status: 'accepted' });
}

// ── createCoopChallenge ───────────────────────────────────────────────────────

describe('createCoopChallenge', () => {
  it('lancia ForbiddenError NOT_FRIENDS se il partner non è amico', async () => {
    const init = await createPlayer('a1');
    const partner = await createPlayer('a2');
    await expect(
      createCoopChallenge(init, partner, CoopChallengeType.COMPLETE_10),
    ).rejects.toMatchObject({ code: 'NOT_FRIENDS' });
  });

  it('crea la sfida con i metadati corretti del tipo', async () => {
    const init = await createPlayer('b1');
    const partner = await createPlayer('b2');
    await makeFriends(init, partner);

    const view = await createCoopChallenge(init, partner, CoopChallengeType.COMPLETE_10);
    expect(view.initiatorId).toBe(init);
    expect(view.partnerId).toBe(partner);
    expect(view.status).toBe('active');
    expect(view.targetValue).toBeGreaterThan(0);
    expect(view.initiatorProgress).toBe(0);
    expect(view.partnerProgress).toBe(0);
    expect(view.totalPercentage).toBe(0);
  });

  it('scadenza a 7 giorni dal momento della creazione', async () => {
    const init = await createPlayer('c1');
    const partner = await createPlayer('c2');
    await makeFriends(init, partner);

    const view = await createCoopChallenge(init, partner, CoopChallengeType.WALK_50KM);
    const now = Date.now();
    const expiresAt = new Date(view.expiresAt).getTime();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    expect(expiresAt).toBeGreaterThan(now + sevenDaysMs - 5000);
    expect(expiresAt).toBeLessThan(now + sevenDaysMs + 5000);
  });

  it('funziona anche con amicizia inversa (partner è requester)', async () => {
    const init = await createPlayer('d1');
    const partner = await createPlayer('d2');
    await Friendship.create({ requesterId: partner, recipientId: init, status: 'accepted' });

    await expect(
      createCoopChallenge(init, partner, CoopChallengeType.COMPLETE_10),
    ).resolves.not.toThrow();
  });
});

// ── addProgress ───────────────────────────────────────────────────────────────

describe('addProgress', () => {
  let init: string;
  let partner: string;
  let challengeId: string;

  const setup = async (suffix: string): Promise<void> => {
    init = await createPlayer(`e1${suffix}`);
    partner = await createPlayer(`e2${suffix}`);
    await makeFriends(init, partner);
    const view = await createCoopChallenge(init, partner, CoopChallengeType.COMPLETE_10);
    challengeId = view.id;
  };

  it("incrementa initiatorProgress quando chiama l'initiator", async () => {
    await setup('a');
    const view = await addProgress(challengeId, init, 3);
    expect(view.initiatorProgress).toBe(3);
    expect(view.partnerProgress).toBe(0);
  });

  it('incrementa partnerProgress quando chiama il partner', async () => {
    await setup('b');
    const view = await addProgress(challengeId, partner, 5);
    expect(view.partnerProgress).toBe(5);
    expect(view.initiatorProgress).toBe(0);
  });

  it('calcola totalPercentage come (init+partner)/target*100', async () => {
    await setup('c');
    const view1 = await addProgress(challengeId, init, 5);
    const view2 = await addProgress(challengeId, partner, 5);
    const total = view2.initiatorProgress + view2.partnerProgress;
    const expected = Math.min(Math.round((total / view1.targetValue) * 100), 100);
    expect(view2.totalPercentage).toBe(expected);
  });

  it('segna la sfida come completed quando totalProgress >= targetValue', async () => {
    await setup('d');
    const target = 10;
    await addProgress(challengeId, init, 6);
    const final = await addProgress(challengeId, partner, target);
    expect(final.status).toBe('completed');
  });

  it('lancia ForbiddenError NOT_PARTICIPANT per player non coinvolto', async () => {
    await setup('e');
    const outsider = await createPlayer('e3e');
    await expect(addProgress(challengeId, outsider, 1)).rejects.toMatchObject({
      code: 'NOT_PARTICIPANT',
    });
  });

  it('lancia BadRequestError CHALLENGE_NOT_ACTIVE per sfida non attiva', async () => {
    await setup('f');
    await CoopChallenge.findByIdAndUpdate(challengeId, { status: 'expired' });
    await expect(addProgress(challengeId, init, 1)).rejects.toMatchObject({
      code: 'CHALLENGE_NOT_ACTIVE',
    });
  });
});

// ── getChallengeById ──────────────────────────────────────────────────────────

describe('getChallengeById', () => {
  it('lancia NotFoundError per sfida inesistente', async () => {
    const playerId = await createPlayer('f1');
    const fakeId = new Types.ObjectId().toHexString();
    await expect(getChallengeById(fakeId, playerId)).rejects.toMatchObject({
      code: 'CHALLENGE_NOT_FOUND',
    });
  });

  it('lancia ForbiddenError NOT_PARTICIPANT se il player non è coinvolto', async () => {
    const init = await createPlayer('g1');
    const partner = await createPlayer('g2');
    const outsider = await createPlayer('g3');
    await makeFriends(init, partner);
    const view = await createCoopChallenge(init, partner, CoopChallengeType.COMPLETE_10);

    await expect(getChallengeById(view.id, outsider)).rejects.toMatchObject({
      code: 'NOT_PARTICIPANT',
    });
  });

  it('restituisce la sfida se il player è initiator', async () => {
    const init = await createPlayer('h1');
    const partner = await createPlayer('h2');
    await makeFriends(init, partner);
    const created = await createCoopChallenge(init, partner, CoopChallengeType.COMPLETE_10);

    const fetched = await getChallengeById(created.id, init);
    expect(fetched.id).toBe(created.id);
  });
});

// ── getActiveChallenges ───────────────────────────────────────────────────────

describe('getActiveChallenges', () => {
  it('restituisce sfide attive del player (come initiator)', async () => {
    const init = await createPlayer('i1');
    const partner = await createPlayer('i2');
    await makeFriends(init, partner);
    await createCoopChallenge(init, partner, CoopChallengeType.COMPLETE_10);

    const list = await getActiveChallenges(init);
    expect(list.length).toBeGreaterThanOrEqual(1);
    expect(list[0].status).toBe('active');
  });

  it('restituisce sfide attive del player (come partner)', async () => {
    const init = await createPlayer('j1');
    const partner = await createPlayer('j2');
    await makeFriends(init, partner);
    await createCoopChallenge(init, partner, CoopChallengeType.COMPLETE_10);

    const list = await getActiveChallenges(partner);
    expect(list.length).toBeGreaterThanOrEqual(1);
  });

  it('marca automaticamente come expired le sfide scadute', async () => {
    const init = await createPlayer('k1');
    const partner = await createPlayer('k2');
    await makeFriends(init, partner);
    const view = await createCoopChallenge(init, partner, CoopChallengeType.COMPLETE_10);

    // Simula scadenza
    await CoopChallenge.findByIdAndUpdate(view.id, {
      expiresAt: new Date(Date.now() - 1000),
    });

    const list = await getActiveChallenges(init);
    const expired = await CoopChallenge.findById(view.id);
    expect(expired?.status).toBe('expired');
    expect(list.find((c) => c.id === view.id)).toBeUndefined();
  });
});

// ── nudgePartner ──────────────────────────────────────────────────────────────

describe('nudgePartner', () => {
  it('lancia ForbiddenError NOT_FRIENDS se non sono amici', async () => {
    const p1 = await createPlayer('l1');
    const p2 = await createPlayer('l2');
    await expect(nudgePartner(p1, p2)).rejects.toMatchObject({ code: 'NOT_FRIENDS' });
  });

  it('primo nudge va a buon fine', async () => {
    const p1 = await createPlayer('m1');
    const p2 = await createPlayer('m2');
    await makeFriends(p1, p2);
    await expect(nudgePartner(p1, p2)).resolves.not.toThrow();
  });

  it('secondo nudge nelle 24 ore lancia BadRequestError NUDGE_RATE_LIMITED', async () => {
    const p1 = await createPlayer('n1');
    const p2 = await createPlayer('n2');
    await makeFriends(p1, p2);
    await nudgePartner(p1, p2);
    await expect(nudgePartner(p1, p2)).rejects.toMatchObject({
      code: 'NUDGE_RATE_LIMITED',
    });
  });

  it('aggiorna lastNudgeAt sul documento di amicizia', async () => {
    const p1 = await createPlayer('o1');
    const p2 = await createPlayer('o2');
    await makeFriends(p1, p2);
    const before = new Date();
    await nudgePartner(p1, p2);
    const friendship = await Friendship.findOne({
      $or: [
        { requesterId: p1, recipientId: p2 },
        { requesterId: p2, recipientId: p1 },
      ],
    });
    expect(friendship?.lastNudgeAt).toBeDefined();
    expect(friendship?.lastNudgeAt?.getTime()).toBeGreaterThanOrEqual(before.getTime());
  });
});
