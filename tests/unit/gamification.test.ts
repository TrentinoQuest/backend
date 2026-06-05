import { describe, it, expect } from 'vitest';
import {
  computeStreakMultiplier,
  computeXpAwarded,
  computeLevelFromXp,
  computeXpToNextLevel,
  computeStreakUpdate,
  shouldEarnShield,
  isNewQuestDay,
  STREAK_SHIELD_INTERVAL_DAYS,
} from '../../src/config/gamification';
import { QuestType } from '../../src/database/models/Quest.model';

// ── computeStreakMultiplier ────────────────────────────────────────────────────

describe('computeStreakMultiplier', () => {
  it('ritorna 1.0 per streak 0', () => {
    expect(computeStreakMultiplier(0)).toBe(1.0);
  });

  it('ritorna 1.0 per streak 1', () => {
    expect(computeStreakMultiplier(1)).toBe(1.0);
  });

  it('ritorna 1.0 per streak 2 (< soglia 3)', () => {
    expect(computeStreakMultiplier(2)).toBe(1.0);
  });

  it('ritorna 1.25 per streak 3', () => {
    expect(computeStreakMultiplier(3)).toBe(1.25);
  });

  it('ritorna 1.25 per streak 6 (< soglia 7)', () => {
    expect(computeStreakMultiplier(6)).toBe(1.25);
  });

  it('ritorna 1.5 per streak 7', () => {
    expect(computeStreakMultiplier(7)).toBe(1.5);
  });

  it('ritorna 1.75 per streak 14', () => {
    expect(computeStreakMultiplier(14)).toBe(1.75);
  });

  it('ritorna 2.0 per streak 30', () => {
    expect(computeStreakMultiplier(30)).toBe(2.0);
  });

  it('ritorna 2.0 per streak > 30', () => {
    expect(computeStreakMultiplier(100)).toBe(2.0);
  });
});

// ── computeXpAwarded ──────────────────────────────────────────────────────────

describe('computeXpAwarded', () => {
  it('assegna 50 XP per quest secondaria con streak 0', () => {
    expect(computeXpAwarded(QuestType.SECONDARY, 0)).toBe(50);
  });

  it('assegna 100 XP per quest principale con streak 0', () => {
    expect(computeXpAwarded(QuestType.PRIMARY, 0)).toBe(100);
  });

  it('applica il moltiplicatore 1.25x a streak 3 (secondaria)', () => {
    expect(computeXpAwarded(QuestType.SECONDARY, 3)).toBe(63); // Math.round(50 * 1.25)
  });

  it('applica il moltiplicatore 1.5x a streak 7 (principale)', () => {
    expect(computeXpAwarded(QuestType.PRIMARY, 7)).toBe(150); // 100 * 1.5
  });

  it('applica il moltiplicatore 2.0x a streak 30 (secondaria)', () => {
    expect(computeXpAwarded(QuestType.SECONDARY, 30)).toBe(100); // 50 * 2.0
  });

  it('ritorna intero (Math.round applicato)', () => {
    const result = computeXpAwarded(QuestType.SECONDARY, 3);
    expect(Number.isInteger(result)).toBe(true);
  });
});

// ── computeLevelFromXp ────────────────────────────────────────────────────────

describe('computeLevelFromXp', () => {
  it('ritorna livello 1 a 0 XP', () => {
    expect(computeLevelFromXp(0)).toEqual({ level: 1, title: 'Visitatore' });
  });

  it('ritorna livello 1 con XP sotto la soglia del livello 2', () => {
    expect(computeLevelFromXp(199)).toEqual({ level: 1, title: 'Visitatore' });
  });

  it('ritorna livello 2 esattamente a 200 XP', () => {
    expect(computeLevelFromXp(200)).toEqual({ level: 2, title: 'Escursionista' });
  });

  it('ritorna livello 5 a 2000 XP', () => {
    expect(computeLevelFromXp(2000)).toEqual({ level: 5, title: 'Ranger' });
  });

  it('ritorna livello 10 a 18000 XP', () => {
    expect(computeLevelFromXp(18000)).toEqual({ level: 10, title: 'Leggenda del Trentino' });
  });

  it('rimane al livello 10 oltre 18000 XP (cap massimo)', () => {
    expect(computeLevelFromXp(999999)).toEqual({ level: 10, title: 'Leggenda del Trentino' });
  });
});

// ── computeXpToNextLevel ──────────────────────────────────────────────────────

describe('computeXpToNextLevel', () => {
  it('ritorna 200 a 0 XP (livello 1 → 2)', () => {
    expect(computeXpToNextLevel(0)).toBe(200);
  });

  it('ritorna il delta corretto a XP intermedi', () => {
    expect(computeXpToNextLevel(100)).toBe(100); // 200 - 100
  });

  it('ritorna null al livello massimo (18000 XP)', () => {
    expect(computeXpToNextLevel(18000)).toBeNull();
  });

  it('ritorna null oltre il livello massimo', () => {
    expect(computeXpToNextLevel(99999)).toBeNull();
  });
});

// ── computeStreakUpdate ───────────────────────────────────────────────────────

describe('computeStreakUpdate', () => {
  const today = new Date('2025-06-05T10:00:00Z');
  const yesterday = new Date('2025-06-04T10:00:00Z');
  const twoDaysAgo = new Date('2025-06-03T10:00:00Z');

  it('nessun cambiamento se lastQuestDate è null', () => {
    const result = computeStreakUpdate(null, false, today);
    expect(result.shieldConsumed).toBe(false);
    expect(result.streakBroken).toBe(false);
  });

  it('nessun cambiamento se lastQuestDate è oggi', () => {
    const result = computeStreakUpdate(today, false, today);
    expect(result.shieldConsumed).toBe(false);
    expect(result.streakBroken).toBe(false);
  });

  it('nessun cambiamento se lastQuestDate è ieri (streak continua)', () => {
    const result = computeStreakUpdate(yesterday, false, today);
    expect(result.shieldConsumed).toBe(false);
    expect(result.streakBroken).toBe(false);
  });

  it('streak rotta dopo gap di 2 giorni senza shield', () => {
    const result = computeStreakUpdate(twoDaysAgo, false, today);
    expect(result.streakBroken).toBe(true);
    expect(result.shieldConsumed).toBe(false);
  });

  it('shield consumato dopo gap di 2 giorni con shield attivo', () => {
    const result = computeStreakUpdate(twoDaysAgo, true, today);
    expect(result.shieldConsumed).toBe(true);
    expect(result.streakBroken).toBe(false);
  });

  it('ignora l\'ora: stesso giorno a orari diversi è "oggi"', () => {
    const sameDayEarly = new Date('2025-06-05T00:01:00Z');
    const sameDayLate = new Date('2025-06-05T23:59:00Z');
    const result = computeStreakUpdate(sameDayEarly, false, sameDayLate);
    expect(result.shieldConsumed).toBe(false);
    expect(result.streakBroken).toBe(false);
  });
});

// ── shouldEarnShield ──────────────────────────────────────────────────────────

describe('shouldEarnShield', () => {
  it('ritorna true a streak multiplo di STREAK_SHIELD_INTERVAL_DAYS senza shield', () => {
    expect(shouldEarnShield(STREAK_SHIELD_INTERVAL_DAYS, false)).toBe(true);
  });

  it('ritorna true a streak 14 (doppio intervallo) senza shield', () => {
    expect(shouldEarnShield(14, false)).toBe(true);
  });

  it('ritorna false se il giocatore ha già uno shield', () => {
    expect(shouldEarnShield(STREAK_SHIELD_INTERVAL_DAYS, true)).toBe(false);
  });

  it('ritorna false per streak non multiplo', () => {
    expect(shouldEarnShield(6, false)).toBe(false);
    expect(shouldEarnShield(8, false)).toBe(false);
  });

  it('ritorna false per streak 0', () => {
    expect(shouldEarnShield(0, false)).toBe(false);
  });
});

// ── isNewQuestDay ─────────────────────────────────────────────────────────────

describe('isNewQuestDay', () => {
  const now = new Date('2025-06-05T10:00:00Z');

  it('ritorna true se lastQuestDate è null (prima quest in assoluto)', () => {
    expect(isNewQuestDay(null, now)).toBe(true);
  });

  it('ritorna false se lastQuestDate è oggi', () => {
    const sameDay = new Date('2025-06-05T08:00:00Z');
    expect(isNewQuestDay(sameDay, now)).toBe(false);
  });

  it('ritorna true se lastQuestDate è ieri', () => {
    const yesterday = new Date('2025-06-04T20:00:00Z');
    expect(isNewQuestDay(yesterday, now)).toBe(true);
  });

  it('ritorna true se lastQuestDate è molto tempo fa', () => {
    const longAgo = new Date('2024-01-01T00:00:00Z');
    expect(isNewQuestDay(longAgo, now)).toBe(true);
  });
});
