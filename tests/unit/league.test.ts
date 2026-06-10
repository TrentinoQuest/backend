import { describe, it, expect } from 'vitest';
import { registerPlayer } from '../../src/modules/auth/services/auth.service';
import {
  getLeagueCurrent,
  getLeagueHistory,
  runLeagueWeeklyReset,
} from '../../src/modules/leagues/services/league.service';
import { Player } from '../../src/database/models/User.model';
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

  it('crea la membership on-demand se il player non è ancora in lega', async () => {
    // Un player registrato a metà settimana non è nei gironi creati al
    // reset del lunedì: deve essere inserito al primo accesso, non vedere 404.
    const playerId = await createPlayer('b');
    await createActiveSeason();

    const view = await getLeagueCurrent(playerId);

    expect(view.tier).toBe(LeagueTier.PORFIDO);
    expect(view.leaderboard).toHaveLength(1);
    expect(view.leaderboard[0].isCurrentPlayer).toBe(true);
    const membership = await LeagueMembership.findOne({ playerId });
    expect(membership).not.toBeNull();
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

// ── runLeagueWeeklyReset ──────────────────────────────────────────────────────

describe('runLeagueWeeklyReset', () => {
  it('crea la stagione della settimana e i gironi per i player esistenti', async () => {
    const a = await createPlayer('r1');
    const b = await createPlayer('r2');

    await runLeagueWeeklyReset();

    const season = await LeagueSeason.findOne({ active: true });
    expect(season).not.toBeNull();
    const memberships = await LeagueMembership.find({ seasonId: season?._id });
    const ids = memberships.map((m) => String(m.playerId));
    expect(ids).toContain(a);
    expect(ids).toContain(b);
  });

  it('è idempotente: una seconda esecuzione nella stessa settimana non duplica nulla', async () => {
    await createPlayer('r3');

    await runLeagueWeeklyReset();
    await runLeagueWeeklyReset();

    const seasons = await LeagueSeason.find();
    expect(seasons).toHaveLength(1);
  });

  it('non marca promosso chi è già al tier massimo né retrocesso chi è al minimo', async () => {
    // Stagione "della settimana scorsa" attiva con un girone piccolo
    const topId = await createPlayer('r4');
    const bottomId = await createPlayer('r5');
    await Player.updateOne({ _id: topId }, { currentLeagueTier: LeagueTier.DOLOMITI });

    const lastMonday = new Date();
    lastMonday.setUTCDate(lastMonday.getUTCDate() - 7);
    const prevSeason = await LeagueSeason.create({
      weekStart: lastMonday,
      weekEnd: new Date(),
      active: true,
    });
    await LeagueMembership.create({
      playerId: topId,
      seasonId: prevSeason._id,
      groupId: 'g-top',
      tier: LeagueTier.DOLOMITI,
      weeklyXp: 500,
    });
    await LeagueMembership.create({
      playerId: bottomId,
      seasonId: prevSeason._id,
      groupId: 'g-bottom',
      tier: LeagueTier.PORFIDO,
      weeklyXp: 0,
    });

    await runLeagueWeeklyReset();

    const topMembership = await LeagueMembership.findOne({
      playerId: topId,
      seasonId: prevSeason._id,
    });
    const bottomMembership = await LeagueMembership.findOne({
      playerId: bottomId,
      seasonId: prevSeason._id,
    });
    // Tier massimo: niente flag promoted (il tier non può salire)
    expect(topMembership?.promoted).toBe(false);
    // Tier minimo: niente flag relegated (il tier non può scendere)
    expect(bottomMembership?.relegated).toBe(false);
    // Nessuno può essere insieme promosso e retrocesso
    expect(topMembership?.promoted && topMembership?.relegated).toBeFalsy();
  });

  it('non assegna mai promoted e relegated insieme nei gironi piccoli', async () => {
    const ids = await Promise.all([1, 2, 3, 4, 5, 6].map((i) => createPlayer(`r6${i}`)));
    const lastMonday = new Date();
    lastMonday.setUTCDate(lastMonday.getUTCDate() - 7);
    const prevSeason = await LeagueSeason.create({
      weekStart: lastMonday,
      weekEnd: new Date(),
      active: true,
    });
    for (let i = 0; i < ids.length; i++) {
      await LeagueMembership.create({
        playerId: ids[i],
        seasonId: prevSeason._id,
        groupId: 'g-small',
        tier: LeagueTier.MARMO,
        weeklyXp: i * 10,
      });
    }

    await runLeagueWeeklyReset();

    const members = await LeagueMembership.find({ seasonId: prevSeason._id });
    for (const m of members) {
      expect(m.promoted && m.relegated).toBe(false);
    }
  });
});
