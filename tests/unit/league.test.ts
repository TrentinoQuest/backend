import { describe, it, expect } from 'vitest';
import { registerPlayer } from '../../src/modules/auth/services/auth.service';
import {
  getLeagueCurrent,
  getLeagueHistory,
} from '../../src/modules/leagues/services/league.service';
import { LeagueSeason, LeagueMembership, LeagueTier } from '../../src/database/models/League.model';
import { Types } from 'mongoose';

async function createPlayer(suffix = ''): Promise<string> {
  const ts = Date.now() + suffix;
  const { user } = await registerPlayer({
    email: `league${ts}@test.com`,
    password: 'Password123',
    username: `lp${ts}`,
  });
  return user.id as string;
}

async function createActiveSeason(): Promise<Types.ObjectId> {
  const now = new Date();
  const season = await LeagueSeason.create({
    weekStart: now,
    weekEnd: new Date(now.getTime() + 7 * 86400000),
    active: true,
  });
  return season._id;
}

// ── getLeagueCurrent ──────────────────────────────────────────────────────────

describe('getLeagueCurrent', () => {
  it('lancia NotFoundError se non esiste stagione attiva', async () => {
    const playerId = await createPlayer('a');
    await expect(getLeagueCurrent(playerId)).rejects.toMatchObject({
      code: 'NO_ACTIVE_SEASON',
    });
  });

  it('lancia NotFoundError se il player non è in lega', async () => {
    const playerId = await createPlayer('b');
    await createActiveSeason();
    await expect(getLeagueCurrent(playerId)).rejects.toMatchObject({
      code: 'NOT_IN_LEAGUE',
    });
  });

  it('restituisce il leaderboard ordinato per weeklyXp decrescente', async () => {
    const seasonId = await createActiveSeason();
    const p1 = await createPlayer('c1');
    const p2 = await createPlayer('c2');
    const p3 = await createPlayer('c3');
    const groupId = 'test-group-c';

    await LeagueMembership.create({
      playerId: p1,
      seasonId,
      groupId,
      tier: LeagueTier.PORFIDO,
      weeklyXp: 100,
    });
    await LeagueMembership.create({
      playerId: p2,
      seasonId,
      groupId,
      tier: LeagueTier.PORFIDO,
      weeklyXp: 200,
    });
    await LeagueMembership.create({
      playerId: p3,
      seasonId,
      groupId,
      tier: LeagueTier.PORFIDO,
      weeklyXp: 50,
    });

    const view = await getLeagueCurrent(p1);
    const xpValues = view.leaderboard.map((e) => e.weeklyXp);
    expect(xpValues).toEqual([...xpValues].sort((a, b) => b - a));
  });

  it('include lo username reale in ogni entry del leaderboard', async () => {
    const seasonId = await createActiveSeason();
    const ts = Date.now() + 'u1';
    const username = `lp${ts}`;
    const { user } = await registerPlayer({
      email: `league${ts}@test.com`,
      password: 'Password123',
      username,
    });
    const playerId = user.id as string;

    await LeagueMembership.create({
      playerId,
      seasonId,
      groupId: 'group-username',
      tier: LeagueTier.PORFIDO,
      weeklyXp: 42,
    });

    const view = await getLeagueCurrent(playerId);
    const entry = view.leaderboard.find((e) => e.playerId === playerId);
    expect(entry?.username).toBe(username);
    // Nessuna entry deve avere username vuoto/mancante
    expect(view.leaderboard.every((e) => e.username.length > 0)).toBe(true);
  });

  it('il player corrente è marcato come isCurrentPlayer nel leaderboard', async () => {
    const seasonId = await createActiveSeason();
    const playerId = await createPlayer('d');
    await LeagueMembership.create({
      playerId,
      seasonId,
      groupId: 'group-d',
      tier: LeagueTier.PORFIDO,
      weeklyXp: 10,
    });

    const view = await getLeagueCurrent(playerId);
    const myEntry = view.leaderboard.find((e) => e.isCurrentPlayer);
    expect(myEntry).toBeDefined();
    expect(myEntry?.playerId).toBe(playerId);
  });

  it('restituisce tier e weeklyXp corretti', async () => {
    const seasonId = await createActiveSeason();
    const playerId = await createPlayer('e');
    await LeagueMembership.create({
      playerId,
      seasonId,
      groupId: 'group-e',
      tier: LeagueTier.MARMO,
      weeklyXp: 75,
    });

    const view = await getLeagueCurrent(playerId);
    expect(view.tier).toBe(LeagueTier.MARMO);
    expect(view.weeklyXp).toBe(75);
  });

  it('include le date della stagione in formato ISO', async () => {
    const seasonId = await createActiveSeason();
    const playerId = await createPlayer('f');
    await LeagueMembership.create({
      playerId,
      seasonId,
      groupId: 'group-f',
      tier: LeagueTier.PORFIDO,
      weeklyXp: 0,
    });

    const view = await getLeagueCurrent(playerId);
    expect(new Date(view.season.weekStart).toString()).not.toBe('Invalid Date');
    expect(new Date(view.season.weekEnd).toString()).not.toBe('Invalid Date');
  });
});

// ── getLeagueHistory ──────────────────────────────────────────────────────────

describe('getLeagueHistory', () => {
  it('restituisce lista vuota se il player non ha partecipato a nessuna lega', async () => {
    const playerId = await createPlayer('g');
    const history = await getLeagueHistory(playerId);
    expect(history).toEqual([]);
  });

  it('restituisce le stagioni precedenti del player', async () => {
    const playerId = await createPlayer('h');
    const s1 = await LeagueSeason.create({
      weekStart: new Date('2025-01-06'),
      weekEnd: new Date('2025-01-12'),
      active: false,
    });
    const s2 = await LeagueSeason.create({
      weekStart: new Date('2025-01-13'),
      weekEnd: new Date('2025-01-19'),
      active: false,
    });

    await LeagueMembership.create({
      playerId,
      seasonId: s1._id,
      groupId: 'hist-g1',
      tier: LeagueTier.PORFIDO,
      weeklyXp: 50,
      rank: 3,
      promoted: false,
      relegated: false,
    });
    await LeagueMembership.create({
      playerId,
      seasonId: s2._id,
      groupId: 'hist-g2',
      tier: LeagueTier.PORFIDO,
      weeklyXp: 120,
      rank: 1,
      promoted: true,
      relegated: false,
    });

    const history = await getLeagueHistory(playerId);
    expect(history).toHaveLength(2);
    const promoted = history.find((h) => h.promoted);
    expect(promoted).toBeDefined();
  });

  it('non restituisce più di 10 stagioni', async () => {
    const playerId = await createPlayer('i');
    for (let i = 0; i < 12; i++) {
      const s = await LeagueSeason.create({
        weekStart: new Date(2025, 0, i * 7 + 1),
        weekEnd: new Date(2025, 0, i * 7 + 7),
        active: false,
      });
      await LeagueMembership.create({
        playerId,
        seasonId: s._id,
        groupId: `hist-group-${i}`,
        tier: LeagueTier.PORFIDO,
        weeklyXp: i * 10,
      });
    }

    const history = await getLeagueHistory(playerId);
    expect(history.length).toBeLessThanOrEqual(10);
  });
});
