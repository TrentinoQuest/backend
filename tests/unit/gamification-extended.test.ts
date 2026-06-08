import { describe, it, expect, beforeEach } from 'vitest';
import { registerPlayer } from '../../src/modules/auth/services/auth.service';
import { applyGamification } from '../../src/modules/quests/services/gamification.service';
import { QuestType } from '../../src/database/models/Quest.model';
import { Player } from '../../src/database/models/User.model';
import { LeagueSeason, LeagueMembership, LeagueTier } from '../../src/database/models/League.model';
import { computeStreakMultiplier } from '../../src/config/gamification';

async function createTestPlayer(suffix = ''): Promise<string> {
  const ts = Date.now() + suffix;
  const { user } = await registerPlayer({
    email: `gamif${ts}@test.com`,
    password: 'Password123',
    username: `gamifplayer${ts}`,
  });
  return user.id as string;
}

// ── coinsAwarded nel risultato ────────────────────────────────────────────────

describe('applyGamification — coinsAwarded', () => {
  it('assegna 10 monete per quest secondaria con streak 0', async () => {
    const playerId = await createTestPlayer('a');
    const result = await applyGamification(playerId, QuestType.SECONDARY);
    expect(result.coinsAwarded).toBe(10);
  });

  it('assegna 25 monete per quest principale con streak 0', async () => {
    const playerId = await createTestPlayer('b');
    const result = await applyGamification(playerId, QuestType.PRIMARY);
    expect(result.coinsAwarded).toBe(25);
  });

  it('applica il moltiplicatore 1.25x a streak 3 (secondaria)', async () => {
    const playerId = await createTestPlayer('c');
    await Player.findByIdAndUpdate(playerId, {
      currentStreak: 2,
      lastQuestDate: new Date(Date.now() - 86400000),
    });
    const result = await applyGamification(playerId, QuestType.SECONDARY);
    expect(result.coinsAwarded).toBe(Math.round(10 * computeStreakMultiplier(3)));
  });

  it('applica il moltiplicatore 1.5x a streak 7 (principale)', async () => {
    const playerId = await createTestPlayer('d');
    await Player.findByIdAndUpdate(playerId, {
      currentStreak: 6,
      lastQuestDate: new Date(Date.now() - 86400000),
    });
    const result = await applyGamification(playerId, QuestType.PRIMARY);
    expect(result.coinsAwarded).toBe(Math.round(25 * computeStreakMultiplier(7)));
  });

  it('coinsAwarded è un intero', async () => {
    const playerId = await createTestPlayer('e');
    await Player.findByIdAndUpdate(playerId, {
      currentStreak: 2,
      lastQuestDate: new Date(Date.now() - 86400000),
    });
    const result = await applyGamification(playerId, QuestType.SECONDARY);
    expect(Number.isInteger(result.coinsAwarded)).toBe(true);
  });
});

// ── coins del player aggiornato ───────────────────────────────────────────────

describe('applyGamification — aggiornamento totalPoints player', () => {
  it('incrementa il campo totalPoints del player dopo quest secondaria', async () => {
    const playerId = await createTestPlayer('f');
    await Player.findByIdAndUpdate(playerId, { totalPoints: 100 });
    const result = await applyGamification(playerId, QuestType.SECONDARY);
    const updated = await Player.findById(playerId);
    expect(updated?.totalPoints).toBe(100 + result.coinsAwarded);
  });

  it('incrementa il campo totalPoints del player dopo quest principale', async () => {
    const playerId = await createTestPlayer('g');
    await Player.findByIdAndUpdate(playerId, { totalPoints: 50 });
    const result = await applyGamification(playerId, QuestType.PRIMARY);
    const updated = await Player.findById(playerId);
    expect(updated?.totalPoints).toBe(50 + result.coinsAwarded);
  });

  it('partendo da 0 i totalPoints corrispondono esattamente a coinsAwarded', async () => {
    const playerId = await createTestPlayer('h');
    const result = await applyGamification(playerId, QuestType.SECONDARY);
    const updated = await Player.findById(playerId);
    expect(updated?.totalPoints).toBe(result.coinsAwarded);
  });
});

// ── weeklyXp lega aggiornato ──────────────────────────────────────────────────

describe('applyGamification — weeklyXp lega', () => {
  let playerId: string;

  beforeEach(async () => {
    playerId = await createTestPlayer('i');
  });

  it('incrementa weeklyXp nella membership se esiste stagione attiva', async () => {
    const season = await LeagueSeason.create({
      weekStart: new Date(),
      weekEnd: new Date(Date.now() + 7 * 86400000),
      active: true,
    });
    await LeagueMembership.create({
      playerId,
      seasonId: season._id,
      groupId: 'test-group',
      tier: LeagueTier.PORFIDO,
      weeklyXp: 0,
    });

    const result = await applyGamification(playerId, QuestType.SECONDARY);
    const membership = await LeagueMembership.findOne({ playerId, seasonId: season._id });
    expect(membership?.weeklyXp).toBe(result.xpAwarded);
  });

  it('non lancia errore se non esiste stagione attiva', async () => {
    await expect(applyGamification(playerId, QuestType.SECONDARY)).resolves.not.toThrow();
  });
});
