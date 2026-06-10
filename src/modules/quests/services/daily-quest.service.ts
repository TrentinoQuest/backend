import {
  DailyQuestAssignment,
  DailyQuestType,
  DailyQuestContext,
} from '../../../database/models/DailyQuest.model';
import { Player } from '../../../database/models/User.model';
import { awardXpAndCoins } from './gamification.service';
import { DAILY_QUEST_POOL } from '../../../config/daily-quests.config';
import { NotFoundError } from '../../../utils/errors';
import { DailyQuestAssignmentView } from '@trentino-quest/shared-types';

/**
 * Chiave del giorno corrente in UTC (YYYY-MM-DD).
 *
 * Tutto il sistema "giornaliero" (assignment, lore quiz, cleanup job)
 * usa il giorno UTC: un'unica definizione di "oggi" evita che intorno
 * alla mezzanotte selettore e chiave di storage puntino a giorni diversi.
 */
function todayString(): string {
  return new Date().toISOString().split('T')[0];
}

/**
 * Numero del giorno corrente in UTC (giorni interi dall'epoch).
 *
 * Preferito al "giorno dell'anno" perche' uniforme anche a cavallo del
 * cambio anno, e calcolato in UTC per coerenza con todayString().
 */
function utcDayNumber(): number {
  return Math.floor(Date.now() / 86_400_000);
}

/** PRNG deterministico (mulberry32): stesso seed → stessa sequenza. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Seleziona 3 missioni dal pool in modo deterministico e globale: tutti
 * gli utenti dello stesso contesto vedono le stesse missioni nello stesso
 * giorno (Fisher-Yates con PRNG seedato sul giorno UTC).
 *
 * Lo shuffle seedato garantisce sia la varieta' giorno per giorno (a
 * differenza di una formula modulare, che con un pool di 6 elementi
 * alternava solo 2 set fissi) sia l'assenza di duplicati. Con pool di
 * dimensione <= 3 ritorna l'intero pool.
 */
export function pickThreeDeterministic<T>(arr: T[], dayNumber: number = utcDayNumber()): T[] {
  if (arr.length <= 3) return [...arr];
  const rand = mulberry32(dayNumber);
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, 3);
}

export async function getDailyQuests(
  playerId: string,
  context: DailyQuestContext,
): Promise<DailyQuestAssignmentView> {
  const date = todayString();
  let assignment = await DailyQuestAssignment.findOne({ playerId, date });

  if (!assignment) {
    const pool = DAILY_QUEST_POOL.filter(
      (q) => q.context === context || q.context === DailyQuestContext.ANY,
    );
    const picked = pickThreeDeterministic(pool);
    assignment = await DailyQuestAssignment.create({
      playerId,
      date,
      context,
      quests: picked.map((q) => ({
        type: q.type,
        title: q.title,
        description: q.description,
        xpReward: q.xpReward,
        coinsReward: q.coinsReward,
        completed: false,
        completedAt: null,
      })),
    });
  }

  return {
    date: assignment.date,
    quests: assignment.quests.map((q) => ({
      type: q.type,
      title: q.title,
      description: q.description,
      xpReward: q.xpReward,
      coinsReward: q.coinsReward,
      completed: q.completed,
      completedAt: q.completedAt ? q.completedAt.toISOString() : null,
    })),
  };
}

export interface CompleteDailyQuestResult {
  xpAwarded: number;
  coinsAwarded: number;
  totalXp: number;
  totalPoints: number;
  alreadyCompleted: boolean;
}

export async function completeDailyQuest(
  playerId: string,
  questType: DailyQuestType,
): Promise<CompleteDailyQuestResult> {
  const date = todayString();
  const assignment = await DailyQuestAssignment.findOne({ playerId, date });
  if (!assignment) {
    throw new NotFoundError('Nessuna missione giornaliera per oggi', 'DAILY_QUEST_NOT_FOUND');
  }

  const quest = assignment.quests.find((q) => q.type === questType);
  if (!quest) {
    throw new NotFoundError('Tipo di missione non presente oggi', 'DAILY_QUEST_TYPE_NOT_FOUND');
  }

  if (quest.completed) {
    const player = await Player.findById(playerId).select('xp totalPoints');
    return {
      xpAwarded: 0,
      coinsAwarded: 0,
      totalXp: player?.xp ?? 0,
      totalPoints: player?.totalPoints ?? 0,
      alreadyCompleted: true,
    };
  }

  quest.completed = true;
  quest.completedAt = new Date();
  await assignment.save();

  // awardXpAndCoins ricalcola anche il livello e aggiorna il weeklyXp
  // della lega: senza, level resterebbe stantio rispetto agli XP.
  const award = await awardXpAndCoins(playerId, quest.xpReward, quest.coinsReward);

  return {
    xpAwarded: quest.xpReward,
    coinsAwarded: quest.coinsReward,
    totalXp: award.totalXp,
    totalPoints: award.totalPoints,
    alreadyCompleted: false,
  };
}
