import { describe, it, expect } from 'vitest';
import { registerPlayer } from '../../src/modules/auth/services/auth.service';
import {
  sendKudos,
  getFeed,
  sendFriendRequest,
  getFriends,
  getPendingRequests,
  acceptFriendRequest,
  rejectFriendRequest,
  removeFriend,
} from '../../src/modules/social/services/social.service';
import { Kudos } from '../../src/database/models/Kudos.model';
import { Friendship } from '../../src/database/models/Friendship.model';
import { Completion } from '../../src/database/models/Completion.model';
import { createTestSecondaryQuest } from '../fixtures';

async function createPlayer(suffix = ''): Promise<{ id: string; username: string }> {
  const ts = Date.now() + suffix;
  const username = `kudosplayer${ts}`;
  const { user } = await registerPlayer({
    email: `kudos${ts}@test.com`,
    password: 'Password123',
    username,
  });
  return { id: user.id as string, username };
}

/** Crea un'amicizia accettata tra due player. */
async function makeFriends(a: string, b: string): Promise<void> {
  await Friendship.create({ requesterId: a, recipientId: b, status: 'accepted' });
}

/** Crea un completamento reale (attività su cui mandare kudos). */
async function createActivity(playerId: string): Promise<string> {
  const quest = await createTestSecondaryQuest();
  const completion = await Completion.create({
    playerId,
    questId: quest._id,
    pointsAwarded: 10,
    position: { type: 'Point', coordinates: [11.12, 46.07] },
  });
  return String(completion._id);
}

// ── sendKudos ─────────────────────────────────────────────────────────────────

describe('sendKudos', () => {
  it('lancia BadRequestError SELF_KUDOS se si manda a se stessi', async () => {
    const player = await createPlayer('a');
    await expect(
      sendKudos(player.id, player.id, 'quest_completion', 'act1', 'beer'),
    ).rejects.toMatchObject({ code: 'SELF_KUDOS' });
  });

  it('lancia ForbiddenError NOT_FRIENDS se i player non sono amici', async () => {
    const from = await createPlayer('nf1');
    const to = await createPlayer('nf2');
    const activityId = await createActivity(to.id);
    await expect(
      sendKudos(from.id, to.id, 'quest_completion', activityId, 'beer'),
    ).rejects.toMatchObject({ code: 'NOT_FRIENDS' });
  });

  it("lancia NotFoundError ACTIVITY_NOT_FOUND se l'attività non appartiene al destinatario", async () => {
    const from = await createPlayer('na1');
    const to = await createPlayer('na2');
    await makeFriends(from.id, to.id);
    // attività che appartiene al MITTENTE, non al destinatario
    const activityId = await createActivity(from.id);
    await expect(
      sendKudos(from.id, to.id, 'quest_completion', activityId, 'beer'),
    ).rejects.toMatchObject({ code: 'ACTIVITY_NOT_FOUND' });
  });

  it('lancia BadRequestError INVALID_ACTIVITY per activityId non ObjectId', async () => {
    const from = await createPlayer('ia1');
    const to = await createPlayer('ia2');
    await makeFriends(from.id, to.id);
    await expect(
      sendKudos(from.id, to.id, 'quest_completion', 'not-an-id', 'beer'),
    ).rejects.toMatchObject({ code: 'INVALID_ACTIVITY' });
  });

  it('crea un documento Kudos nel DB', async () => {
    const from = await createPlayer('b1');
    const to = await createPlayer('b2');
    await makeFriends(from.id, to.id);
    const activityId = await createActivity(to.id);
    await sendKudos(from.id, to.id, 'quest_completion', activityId, 'star');
    const doc = await Kudos.findOne({ fromPlayerId: from.id, activityId });
    expect(doc).not.toBeNull();
    expect(doc?.emoji).toBe('star');
    expect(String(doc?.toPlayerId)).toBe(to.id);
  });

  it('lancia ConflictError KUDOS_ALREADY_SENT per kudos duplicato sulla stessa attività', async () => {
    const from = await createPlayer('c1');
    const to = await createPlayer('c2');
    await makeFriends(from.id, to.id);
    const activityId = await createActivity(to.id);
    await sendKudos(from.id, to.id, 'quest_completion', activityId, 'beer');
    await expect(
      sendKudos(from.id, to.id, 'quest_completion', activityId, 'highfive'),
    ).rejects.toMatchObject({ code: 'KUDOS_ALREADY_SENT' });
  });

  it('permette kudos diversi sulla stessa attività da player diversi', async () => {
    const from1 = await createPlayer('d1');
    const from2 = await createPlayer('d2');
    const to = await createPlayer('d3');
    await makeFriends(from1.id, to.id);
    await makeFriends(from2.id, to.id);
    const activityId = await createActivity(to.id);
    await sendKudos(from1.id, to.id, 'quest_completion', activityId, 'beer');
    await expect(
      sendKudos(from2.id, to.id, 'quest_completion', activityId, 'star'),
    ).resolves.not.toThrow();
  });

  it('permette lo stesso player di mandare kudos su attività diverse', async () => {
    const from = await createPlayer('e1');
    const to = await createPlayer('e2');
    await makeFriends(from.id, to.id);
    const act1 = await createActivity(to.id);
    const act2 = await createActivity(to.id);
    await sendKudos(from.id, to.id, 'quest_completion', act1, 'beer');
    await expect(
      sendKudos(from.id, to.id, 'quest_completion', act2, 'beer'),
    ).resolves.not.toThrow();
  });
});

// ── sendFriendRequest ─────────────────────────────────────────────────────────

describe('sendFriendRequest', () => {
  it('lancia BadRequestError CANNOT_FRIEND_SELF se si aggiunge se stessi', async () => {
    const player = await createPlayer('f');
    await expect(sendFriendRequest(player.id, { username: player.username })).rejects.toMatchObject(
      {
        code: 'CANNOT_FRIEND_SELF',
      },
    );
  });

  it('crea una richiesta di amicizia pending', async () => {
    const req = await createPlayer('g1');
    const rec = await createPlayer('g2');
    await sendFriendRequest(req.id, { username: rec.username });
    const doc = await Friendship.findOne({ requesterId: req.id, recipientId: rec.id });
    expect(doc).not.toBeNull();
    expect(doc?.status).toBe('pending');
  });

  it('lancia ConflictError FRIENDSHIP_ALREADY_EXISTS per richiesta duplicata', async () => {
    const req = await createPlayer('h1');
    const rec = await createPlayer('h2');
    await sendFriendRequest(req.id, { username: rec.username });
    await expect(sendFriendRequest(req.id, { username: rec.username })).rejects.toMatchObject({
      code: 'FRIENDSHIP_ALREADY_EXISTS',
    });
  });

  it('lancia ConflictError FRIENDSHIP_ALREADY_EXISTS se la richiesta inversa esiste già', async () => {
    const p1 = await createPlayer('i1');
    const p2 = await createPlayer('i2');
    await sendFriendRequest(p1.id, { username: p2.username });
    await expect(sendFriendRequest(p2.id, { username: p1.username })).rejects.toMatchObject({
      code: 'FRIENDSHIP_ALREADY_EXISTS',
    });
  });
});

// ── acceptFriendRequest ───────────────────────────────────────────────────────

describe('acceptFriendRequest', () => {
  it('accetta la richiesta di amicizia e aggiorna status a accepted', async () => {
    const requester = await createPlayer('j1');
    const recipient = await createPlayer('j2');
    await sendFriendRequest(requester.id, { username: recipient.username });
    const friendship = await Friendship.findOne({
      requesterId: requester.id,
      recipientId: recipient.id,
    });
    await acceptFriendRequest(String(friendship!._id), recipient.id);
    const doc = await Friendship.findById(friendship!._id);
    expect(doc?.status).toBe('accepted');
  });

  it('lancia ForbiddenError NOT_THE_RECIPIENT se non è il destinatario', async () => {
    const requester = await createPlayer('j3');
    const recipient = await createPlayer('j4');
    await sendFriendRequest(requester.id, { username: recipient.username });
    const friendship = await Friendship.findOne({
      requesterId: requester.id,
      recipientId: recipient.id,
    });
    await expect(acceptFriendRequest(String(friendship!._id), requester.id)).rejects.toMatchObject({
      code: 'NOT_THE_RECIPIENT',
    });
  });

  it('lancia NotFoundError FRIENDSHIP_NOT_FOUND per richiesta inesistente', async () => {
    const p = await createPlayer('j5');
    await expect(acceptFriendRequest('000000000000000000000001', p.id)).rejects.toMatchObject({
      code: 'FRIENDSHIP_NOT_FOUND',
    });
  });
});

// ── rejectFriendRequest ───────────────────────────────────────────────────────

describe('rejectFriendRequest', () => {
  it('rifiuta la richiesta e aggiorna status a rejected', async () => {
    const requester = await createPlayer('k1');
    const recipient = await createPlayer('k2');
    await sendFriendRequest(requester.id, { username: recipient.username });
    const friendship = await Friendship.findOne({
      requesterId: requester.id,
      recipientId: recipient.id,
    });
    await rejectFriendRequest(String(friendship!._id), recipient.id);
    const doc = await Friendship.findById(friendship!._id);
    expect(doc?.status).toBe('rejected');
  });

  it('lancia ForbiddenError NOT_THE_RECIPIENT se non è il destinatario', async () => {
    const requester = await createPlayer('k3');
    const recipient = await createPlayer('k4');
    await sendFriendRequest(requester.id, { username: recipient.username });
    const friendship = await Friendship.findOne({
      requesterId: requester.id,
      recipientId: recipient.id,
    });
    await expect(rejectFriendRequest(String(friendship!._id), requester.id)).rejects.toMatchObject({
      code: 'NOT_THE_RECIPIENT',
    });
  });
});

// ── getFriends ────────────────────────────────────────────────────────────────

describe('getFriends', () => {
  it('restituisce lista vuota se non ci sono amici accepted', async () => {
    const p = await createPlayer('l1');
    const friends = await getFriends(p.id);
    expect(friends).toHaveLength(0);
  });

  it('restituisce gli amici accepted', async () => {
    const p1 = await createPlayer('l2');
    const p2 = await createPlayer('l3');
    await sendFriendRequest(p1.id, { username: p2.username });
    const friendship = await Friendship.findOne({ requesterId: p1.id, recipientId: p2.id });
    await acceptFriendRequest(String(friendship!._id), p2.id);
    const friends = await getFriends(p1.id);
    expect(friends.map((f) => f.playerId)).toContain(p2.id);
  });

  it('non include amicizie pending', async () => {
    const p1 = await createPlayer('l4');
    const p2 = await createPlayer('l5');
    await sendFriendRequest(p1.id, { username: p2.username });
    const friends = await getFriends(p1.id);
    expect(friends).toHaveLength(0);
  });
});

// ── getPendingRequests ────────────────────────────────────────────────────────

describe('getPendingRequests', () => {
  it('restituisce le richieste pending ricevute', async () => {
    const requester = await createPlayer('m1');
    const recipient = await createPlayer('m2');
    await sendFriendRequest(requester.id, { username: recipient.username });
    const requests = await getPendingRequests(recipient.id);
    expect(requests.map((r) => r.requesterId)).toContain(requester.id);
  });

  it('non include richieste inviate (solo ricevute)', async () => {
    const sender = await createPlayer('m3');
    const receiver = await createPlayer('m4');
    await sendFriendRequest(sender.id, { username: receiver.username });
    const requestsOfSender = await getPendingRequests(sender.id);
    expect(requestsOfSender.map((r) => r.requesterId)).not.toContain(receiver.id);
  });
});

// ── removeFriend ──────────────────────────────────────────────────────────────

describe('removeFriend', () => {
  it("rimuove l'amicizia per entrambi", async () => {
    const p1 = await createPlayer('n1');
    const p2 = await createPlayer('n2');
    await sendFriendRequest(p1.id, { username: p2.username });
    const friendship = await Friendship.findOne({ requesterId: p1.id, recipientId: p2.id });
    await acceptFriendRequest(String(friendship!._id), p2.id);
    await removeFriend(String(friendship!._id), p1.id);
    const doc = await Friendship.findById(friendship!._id);
    expect(doc).toBeNull();
  });

  it('lancia NotFoundError FRIENDSHIP_NOT_FOUND se non è accepted', async () => {
    const p1 = await createPlayer('n3');
    const p2 = await createPlayer('n4');
    await sendFriendRequest(p1.id, { username: p2.username });
    const friendship = await Friendship.findOne({ requesterId: p1.id, recipientId: p2.id });
    await expect(removeFriend(String(friendship!._id), p1.id)).rejects.toMatchObject({
      code: 'FRIENDSHIP_NOT_FOUND',
    });
  });
});

// ── Richieste dopo un rifiuto ─────────────────────────────────────────────────

describe('sendFriendRequest — dopo un rifiuto', () => {
  it('permette una nuova richiesta se la precedente era stata rifiutata', async () => {
    const requester = await createPlayer('rj1');
    const recipient = await createPlayer('rj2');

    await sendFriendRequest(requester.id, { username: recipient.username });
    const first = await Friendship.findOne({ requesterId: requester.id });
    await rejectFriendRequest(String(first?._id), recipient.id);

    // La nuova richiesta NON deve essere bloccata dal vecchio "rejected"
    await expect(
      sendFriendRequest(requester.id, { username: recipient.username }),
    ).resolves.not.toThrow();

    const fresh = await Friendship.findOne({
      requesterId: requester.id,
      recipientId: recipient.id,
    });
    expect(fresh?.status).toBe('pending');
  });

  it('accetta il destinatario indicato per recipientId', async () => {
    const requester = await createPlayer('rid1');
    const recipient = await createPlayer('rid2');

    await sendFriendRequest(requester.id, { recipientId: recipient.id });

    const doc = await Friendship.findOne({ requesterId: requester.id });
    expect(String(doc?.recipientId)).toBe(recipient.id);
  });
});

// ── Paginazione feed ──────────────────────────────────────────────────────────

describe('getFeed — paginazione', () => {
  it('offset oltre la prima pagina restituisce gli elementi più vecchi, non array vuoto', async () => {
    const me = await createPlayer('fp1');
    const friend = await createPlayer('fp2');
    await makeFriends(me.id, friend.id);

    // 5 completamenti dell'amico con timestamp crescenti
    const quest = await createTestSecondaryQuest();
    for (let i = 0; i < 5; i++) {
      await Completion.create({
        playerId: friend.id,
        questId: quest._id,
        pointsAwarded: 10,
        position: { type: 'Point', coordinates: [11.12, 46.07] },
        completedAt: new Date(Date.now() - i * 60000),
      });
    }

    const pageSize = 2;
    const page1 = await getFeed(me.id, pageSize, 0);
    const page2 = await getFeed(me.id, pageSize, 2);
    const page3 = await getFeed(me.id, pageSize, 4);

    expect(page1).toHaveLength(2);
    expect(page2).toHaveLength(2);
    // Il vecchio slice su limit*2 qui restituiva [] pur esistendo il 5° elemento
    expect(page3).toHaveLength(1);

    const allIds = [...page1, ...page2, ...page3].map((i) => i.activityId);
    expect(new Set(allIds).size).toBe(5);
  });
});
