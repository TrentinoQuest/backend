import { describe, it, expect } from 'vitest';
import { registerPlayer } from '../../src/modules/auth/services/auth.service';
import {
  sendKudos,
  sendFriendRequest,
  getFriends,
  getPendingRequests,
  acceptFriendRequest,
  rejectFriendRequest,
  removeFriend,
} from '../../src/modules/social/services/social.service';
import { Kudos } from '../../src/database/models/Kudos.model';
import { Friendship } from '../../src/database/models/Friendship.model';

async function createPlayer(suffix = ''): Promise<string> {
  const ts = Date.now() + suffix;
  const { user } = await registerPlayer({
    email: `kudos${ts}@test.com`,
    password: 'Password123',
    username: `kudosplayer${ts}`,
  });
  return user.id as string;
}

// ── sendKudos ─────────────────────────────────────────────────────────────────

describe('sendKudos', () => {
  it('lancia BadRequestError SELF_KUDOS se si manda a se stessi', async () => {
    const playerId = await createPlayer('a');
    await expect(
      sendKudos(playerId, playerId, 'quest_completion', 'act1', 'beer'),
    ).rejects.toMatchObject({ code: 'SELF_KUDOS' });
  });

  it('crea un documento Kudos nel DB', async () => {
    const from = await createPlayer('b1');
    const to = await createPlayer('b2');
    await sendKudos(from, to, 'quest_completion', 'activity-xyz', 'star');
    const doc = await Kudos.findOne({ fromPlayerId: from, activityId: 'activity-xyz' });
    expect(doc).not.toBeNull();
    expect(doc?.emoji).toBe('star');
    expect(String(doc?.toPlayerId)).toBe(to);
  });

  it('lancia ConflictError KUDOS_ALREADY_SENT per kudos duplicato sulla stessa attività', async () => {
    const from = await createPlayer('c1');
    const to = await createPlayer('c2');
    await sendKudos(from, to, 'quest_completion', 'dup-activity', 'beer');
    await expect(
      sendKudos(from, to, 'quest_completion', 'dup-activity', 'highfive'),
    ).rejects.toMatchObject({ code: 'KUDOS_ALREADY_SENT' });
  });

  it('permette kudos diversi sulla stessa attività da player diversi', async () => {
    const from1 = await createPlayer('d1');
    const from2 = await createPlayer('d2');
    const to = await createPlayer('d3');
    await sendKudos(from1, to, 'quest_completion', 'shared-act', 'beer');
    await expect(
      sendKudos(from2, to, 'quest_completion', 'shared-act', 'star'),
    ).resolves.not.toThrow();
  });

  it('permette lo stesso player di mandare kudos su attività diverse', async () => {
    const from = await createPlayer('e1');
    const to = await createPlayer('e2');
    await sendKudos(from, to, 'quest_completion', 'act-first', 'beer');
    await expect(
      sendKudos(from, to, 'quest_completion', 'act-second', 'beer'),
    ).resolves.not.toThrow();
  });
});

// ── sendFriendRequest ─────────────────────────────────────────────────────────

describe('sendFriendRequest', () => {
  it('lancia BadRequestError CANNOT_FRIEND_SELF se si aggiunge se stessi', async () => {
    const playerId = await createPlayer('f');
    await expect(sendFriendRequest(playerId, playerId)).rejects.toMatchObject({
      code: 'CANNOT_FRIEND_SELF',
    });
  });

  it('crea una richiesta di amicizia pending', async () => {
    const req = await createPlayer('g1');
    const rec = await createPlayer('g2');
    await sendFriendRequest(req, rec);
    const doc = await Friendship.findOne({ requesterId: req, recipientId: rec });
    expect(doc).not.toBeNull();
    expect(doc?.status).toBe('pending');
  });

  it('lancia ConflictError FRIENDSHIP_ALREADY_EXISTS per richiesta duplicata', async () => {
    const req = await createPlayer('h1');
    const rec = await createPlayer('h2');
    await sendFriendRequest(req, rec);
    await expect(sendFriendRequest(req, rec)).rejects.toMatchObject({
      code: 'FRIENDSHIP_ALREADY_EXISTS',
    });
  });

  it('lancia ConflictError FRIENDSHIP_ALREADY_EXISTS se la richiesta inversa esiste già', async () => {
    const p1 = await createPlayer('i1');
    const p2 = await createPlayer('i2');
    await sendFriendRequest(p1, p2);
    await expect(sendFriendRequest(p2, p1)).rejects.toMatchObject({
      code: 'FRIENDSHIP_ALREADY_EXISTS',
    });
  });
});

// ── acceptFriendRequest ───────────────────────────────────────────────────────

describe('acceptFriendRequest', () => {
  it('accetta la richiesta di amicizia e aggiorna status a accepted', async () => {
    const requester = await createPlayer('j1');
    const recipient = await createPlayer('j2');
    await sendFriendRequest(requester, recipient);
    const friendship = await Friendship.findOne({ requesterId: requester, recipientId: recipient });
    await acceptFriendRequest(String(friendship!._id), recipient);
    const doc = await Friendship.findById(friendship!._id);
    expect(doc?.status).toBe('accepted');
  });

  it('lancia ForbiddenError NOT_THE_RECIPIENT se non è il destinatario', async () => {
    const requester = await createPlayer('j3');
    const recipient = await createPlayer('j4');
    await sendFriendRequest(requester, recipient);
    const friendship = await Friendship.findOne({ requesterId: requester, recipientId: recipient });
    await expect(acceptFriendRequest(String(friendship!._id), requester)).rejects.toMatchObject({
      code: 'NOT_THE_RECIPIENT',
    });
  });

  it('lancia NotFoundError FRIENDSHIP_NOT_FOUND per richiesta inesistente', async () => {
    const p = await createPlayer('j5');
    await expect(acceptFriendRequest('000000000000000000000001', p)).rejects.toMatchObject({
      code: 'FRIENDSHIP_NOT_FOUND',
    });
  });
});

// ── rejectFriendRequest ───────────────────────────────────────────────────────

describe('rejectFriendRequest', () => {
  it('rifiuta la richiesta e aggiorna status a rejected', async () => {
    const requester = await createPlayer('k1');
    const recipient = await createPlayer('k2');
    await sendFriendRequest(requester, recipient);
    const friendship = await Friendship.findOne({ requesterId: requester, recipientId: recipient });
    await rejectFriendRequest(String(friendship!._id), recipient);
    const doc = await Friendship.findById(friendship!._id);
    expect(doc?.status).toBe('rejected');
  });

  it('lancia ForbiddenError NOT_THE_RECIPIENT se non è il destinatario', async () => {
    const requester = await createPlayer('k3');
    const recipient = await createPlayer('k4');
    await sendFriendRequest(requester, recipient);
    const friendship = await Friendship.findOne({ requesterId: requester, recipientId: recipient });
    await expect(rejectFriendRequest(String(friendship!._id), requester)).rejects.toMatchObject({
      code: 'NOT_THE_RECIPIENT',
    });
  });
});

// ── getFriends ────────────────────────────────────────────────────────────────

describe('getFriends', () => {
  it('restituisce lista vuota se non ci sono amici accepted', async () => {
    const p = await createPlayer('l1');
    const friends = await getFriends(p);
    expect(friends).toHaveLength(0);
  });

  it('restituisce gli amici accepted', async () => {
    const p1 = await createPlayer('l2');
    const p2 = await createPlayer('l3');
    await sendFriendRequest(p1, p2);
    const friendship = await Friendship.findOne({ requesterId: p1, recipientId: p2 });
    await acceptFriendRequest(String(friendship!._id), p2);
    const friends = await getFriends(p1);
    expect(friends.map((f) => f.playerId)).toContain(p2);
  });

  it('non include amicizie pending', async () => {
    const p1 = await createPlayer('l4');
    const p2 = await createPlayer('l5');
    await sendFriendRequest(p1, p2);
    const friends = await getFriends(p1);
    expect(friends).toHaveLength(0);
  });
});

// ── getPendingRequests ────────────────────────────────────────────────────────

describe('getPendingRequests', () => {
  it('restituisce le richieste pending ricevute', async () => {
    const requester = await createPlayer('m1');
    const recipient = await createPlayer('m2');
    await sendFriendRequest(requester, recipient);
    const requests = await getPendingRequests(recipient);
    expect(requests.map((r) => r.requesterId)).toContain(requester);
  });

  it('non include richieste inviate (solo ricevute)', async () => {
    const sender = await createPlayer('m3');
    const receiver = await createPlayer('m4');
    await sendFriendRequest(sender, receiver);
    const requestsOfSender = await getPendingRequests(sender);
    expect(requestsOfSender.map((r) => r.requesterId)).not.toContain(receiver);
  });
});

// ── removeFriend ──────────────────────────────────────────────────────────────

describe('removeFriend', () => {
  it("rimuove l'amicizia per entrambi", async () => {
    const p1 = await createPlayer('n1');
    const p2 = await createPlayer('n2');
    await sendFriendRequest(p1, p2);
    const friendship = await Friendship.findOne({ requesterId: p1, recipientId: p2 });
    await acceptFriendRequest(String(friendship!._id), p2);
    await removeFriend(String(friendship!._id), p1);
    const doc = await Friendship.findById(friendship!._id);
    expect(doc).toBeNull();
  });

  it('lancia NotFoundError FRIENDSHIP_NOT_FOUND se non è accepted', async () => {
    const p1 = await createPlayer('n3');
    const p2 = await createPlayer('n4');
    await sendFriendRequest(p1, p2);
    const friendship = await Friendship.findOne({ requesterId: p1, recipientId: p2 });
    await expect(removeFriend(String(friendship!._id), p1)).rejects.toMatchObject({
      code: 'FRIENDSHIP_NOT_FOUND',
    });
  });
});
