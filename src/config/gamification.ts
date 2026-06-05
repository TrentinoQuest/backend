import { QuestType } from '../database/models/Quest.model';

/** XP base guadagnati completando una quest secondaria (check-in). */
export const XP_SECONDARY_QUEST = 50;

/** XP base guadagnati completando una quest principale (QR scan). */
export const XP_PRIMARY_QUEST = 100;

/**
 * Tabella dei moltiplicatori streak in ordine decrescente per giorni.
 * Il primo match vince: [giorni_minimo_inclusivo, moltiplicatore].
 */
export const STREAK_MULTIPLIERS: [number, number][] = [
  [30, 2.0],
  [14, 1.75],
  [7, 1.5],
  [3, 1.25],
  [1, 1.0],
];

/** Ogni quanti giorni di streak consecutiva si guadagna uno streak shield. */
export const STREAK_SHIELD_INTERVAL_DAYS = 7;

/** Tabella livelli: livello, titolo, XP totali richiesti per raggiungerlo. */
export const LEVELS: { level: number; title: string; xpRequired: number }[] = [
  { level: 1, title: 'Visitatore', xpRequired: 0 },
  { level: 2, title: 'Escursionista', xpRequired: 200 },
  { level: 3, title: 'Esploratore', xpRequired: 500 },
  { level: 4, title: 'Avventuriero', xpRequired: 1_000 },
  { level: 5, title: 'Ranger', xpRequired: 2_000 },
  { level: 6, title: 'Sentinella', xpRequired: 3_500 },
  { level: 7, title: 'Pioniere', xpRequired: 5_500 },
  { level: 8, title: 'Guardiano', xpRequired: 8_000 },
  { level: 9, title: 'Custode del Trentino', xpRequired: 12_000 },
  { level: 10, title: 'Leggenda del Trentino', xpRequired: 18_000 },
];

/** Ritorna il moltiplicatore XP per la streak corrente. */
export function computeStreakMultiplier(currentStreak: number): number {
  for (const [minDays, multiplier] of STREAK_MULTIPLIERS) {
    if (currentStreak >= minDays) {
      return multiplier;
    }
  }
  return 1.0;
}

/** Calcola gli XP da assegnare: XP_base × moltiplicatore, arrotondato a intero. */
export function computeXpAwarded(questType: QuestType, currentStreak: number): number {
  const base = questType === QuestType.PRIMARY ? XP_PRIMARY_QUEST : XP_SECONDARY_QUEST;
  return Math.round(base * computeStreakMultiplier(currentStreak));
}

/** Dato il totale XP, ritorna il livello e il titolo corrente. */
export function computeLevelFromXp(totalXp: number): { level: number; title: string } {
  for (let i = LEVELS.length - 1; i >= 0; i--) {
    if (totalXp >= LEVELS[i].xpRequired) {
      return { level: LEVELS[i].level, title: LEVELS[i].title };
    }
  }
  return { level: 1, title: 'Visitatore' };
}

/** XP mancanti al prossimo livello, null se al livello massimo. */
export function computeXpToNextLevel(totalXp: number): number | null {
  const current = computeLevelFromXp(totalXp);
  const next = LEVELS.find((l) => l.level === current.level + 1);
  return next ? next.xpRequired - totalXp : null;
}

/**
 * Calcola lo stato della streak in base all'ultima data di completamento.
 * Logica lazy: chiamata all'inizio di ogni completamento e al GET /player/me.
 * Non incrementa la streak per il completamento corrente (lo fa il service dopo).
 */
export function computeStreakUpdate(
  lastQuestDate: Date | null,
  streakShieldActive: boolean,
  now: Date,
): { newStreak: number; shieldConsumed: boolean; streakBroken: boolean } {
  if (!lastQuestDate) {
    return { newStreak: 0, shieldConsumed: false, streakBroken: false };
  }

  const today = toDateOnly(now);
  const lastDate = toDateOnly(lastQuestDate);

  if (isSameDay(lastDate, today)) {
    return { newStreak: 0, shieldConsumed: false, streakBroken: false };
  }

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (isSameDay(lastDate, yesterday)) {
    return { newStreak: 0, shieldConsumed: false, streakBroken: false };
  }

  // Gap di 1+ giorni
  if (streakShieldActive) {
    return { newStreak: 0, shieldConsumed: true, streakBroken: false };
  }
  return { newStreak: 0, shieldConsumed: false, streakBroken: true };
}

/**
 * Ritorna true se il giocatore deve ricevere uno shield:
 * streak multiplo di STREAK_SHIELD_INTERVAL_DAYS e nessuno shield già attivo.
 */
export function shouldEarnShield(newStreak: number, hadShieldBefore: boolean): boolean {
  if (hadShieldBefore || newStreak === 0) return false;
  return newStreak % STREAK_SHIELD_INTERVAL_DAYS === 0;
}

/** True se oggi è un giorno diverso dall'ultimo completamento (per decidere se incrementare la streak). */
export function isNewQuestDay(lastQuestDate: Date | null, now: Date): boolean {
  if (!lastQuestDate) return true;
  return !isSameDay(toDateOnly(lastQuestDate), toDateOnly(now));
}

function toDateOnly(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
