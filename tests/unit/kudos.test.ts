import { describe, it, expect } from 'vitest';
import { registerPlayer } from '../../src/modules/auth/services/auth.service';
import {
  sendKudos,
  sendFriendRequest,
  respondFriendRequest,
  getFriendSuggestions,
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
  it('lancia BadRequestError SELF_FRIEND se si aggiunge se stessi', async () => {
    const playerId = await createPlayer('f');
    await expect(sendFriendRequest(playerId, playerId)).rejects.toMatchObject({
      code: 'SELF_FRIEND',
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

  it('lancia ConflictError FRIENDSHIP_EXISTS per richiesta duplicata', async () => {
    const req = await createPlayer('h1');
    const rec = await createPlayer('h2');
    await sendFriendRequest(req, rec);
    await expect(sendFriendRequest(req, rec)).rejects.toMatchObject({
      code: 'FRIENDSHIP_EXISTS',
    });
  });

  it('lancia ConflictError FRIENDSHIP_EXISTS se la richiesta inversa esiste già', async () => {
    const p1 = await createPlayer('i1');
    const p2 = await createPlayer('i2');
    await sendFriendRequest(p1, p2);
    await expect(sendFriendRequest(p2, p1)).rejects.toMatchObject({
      code: 'FRIENDSHIP_EXISTS',
    });
  });
});

// ── respondFriendRequest ──────────────────────────────────────────────────────

describe('respondFriendRequest', () => {
  it('accetta la richiesta di amicizia e aggiorna status a accepted', async () => {
    const req = await createPlayer('j1');
    const rec = await createPlayer('j2');
    await sendFriendRequest(req, rec);
    await respondFriendRequest(rec, req, true);
    const doc = await Friendship.findOne({ requesterId: req, recipientId: rec });
    expect(doc?.status).toBe('accepted');
  });

  it('rifiuta la richiesta di amicizia e aggiorna status a rejected', async () => {
    const req = await createPlayer('k1');
    const rec = await createPlayer('k2');
    await sendFriendRequest(req, rec);
    await respondFriendRequest(rec, req, false);
    const doc = await Friendship.findOne({ requesterId: req, recipientId: rec });
    expect(doc?.status).toBe('rejected');
  });

  it('lancia NotFoundError FRIENDSHIP_NOT_FOUND per richiesta inesistente', async () => {
    const p1 = await createPlayer('l1');
    const p2 = await createPlayer('l2');
    await expect(respondFriendRequest(p1, p2, true)).rejects.toMatchObject({
      code: 'FRIENDSHIP_NOT_FOUND',
    });
  });
});

// ── getFriendSuggestions ──────────────────────────────────────────────────────

describe('getFriendSuggestions', () => {
  it('restituisce lista vuota se non ci sono altri player', async () => {
    const playerId = await createPlayer('m');
    const suggestions = await getFriendSuggestions(playerId, 10);
    expect(suggestions).toEqual([]);
  });

  it('esclude player già in amicizia (qualsiasi stato)', async () => {
    const me = await createPlayer('n1');
    const friend = await createPlayer('n2');
    const other = await createPlayer('n3');
    await sendFriendRequest(me, friend);

    const suggestions = await getFriendSuggestions(me, 10);
    const ids = suggestions.map((s) => s.playerId);
    expect(ids).not.toContain(friend);
    expect(ids).toContain(other);
  });

  it('non include se stesso nei suggerimenti', async () => {
    const playerId = await createPlayer('o');
    await createPlayer('o2');
    const suggestions = await getFriendSuggestions(playerId, 10);
    const ids = suggestions.map((s) => s.playerId);
    expect(ids).not.toContain(playerId);
  });
});
