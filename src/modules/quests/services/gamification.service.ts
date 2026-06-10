import { GamificationResult } from '@trentino-quest/shared-types';
import { Player, IPlayer } from '../../../database/models/User.model';
import { QuestType } from '../../../database/models/Quest.model';
import { LeagueMembership, LeagueSeason } from '../../../database/models/League.model';
import { NotFoundError } from '../../../utils/errors';
import {
  computeStreakUpdate,
  computeXpAwarded,
  computeStreakMultiplier,
  computeLevelFromXp,
  shouldEarnShield,
  isNewQuestDay,
} from '../../../config/gamification';

/**
 * Risultato di applyGamification: il GamificationResult da esporre al
 * client piu' il saldo monete aggiornato (letto DOPO l'incremento, per
 * non riportare al client un valore stantio).
 */
export interface AppliedGamification {
  gamification: GamificationResult;
  /** Saldo totalPoints del player dopo l'accredito. */
  totalPoints: number;
}

/**
 * Aggiorna weeklyXp nella lega corrente (fire-and-forget: non blocca
 * la risposta se la lega non e' configurata).
 */
async function addWeeklyXpToLeague(playerId: string, xpAwarded: number): Promise<void> {
  try {
    const activeSeason = await LeagueSeason.findOne({ active: true });
    if (activeSeason) {
      await LeagueMembership.updateOne(
        { playerId, seasonId: activeSeason._id },
        { $inc: { weeklyXp: xpAwarded } },
      );
    }
  } catch {
    // non bloccare la risposta se la lega non e' configurata
  }
}

/**
 * Applica la logica di gamification dopo un completamento.
 *
 * Aggiorna xp, level, streak, streakShieldActive e totalPoints sul
 * Player. totalPoints rappresenta la valuta di gioco: l'UNICO accredito
 * per un completamento avviene qui, calcolato come basePoints della
 * quest moltiplicati per il moltiplicatore streak. Ritorna i dati da
 * includere nella risposta del completamento piu' il saldo aggiornato.
 *
 * Ordine delle operazioni:
 * 1. Carica il Player
 * 2. Calcola lo stato streak (shield consumato / streak azzerata)
 * 3. Incrementa streak se giorno nuovo
 * 4. Aggiorna longestStreak
 * 5. Calcola XP, monete e nuovo livello
 * 6. Verifica se guadagna shield
 * 7. Aggiorna lastQuestDate
 * 8. Persiste con findByIdAndUpdate e legge il saldo aggiornato
 */
export async function applyGamification(
  playerId: string,
  questType: QuestType,
  basePoints: number,
): Promise<AppliedGamification> {
  const player = await Player.findById(playerId);
  if (!player) {
    throw new NotFoundError('Giocatore non trovato', 'PLAYER_NOT_FOUND');
  }

  const now = new Date();

  // Passo 2: stato streak prima del completamento
  const streakUpdate = computeStreakUpdate(player.lastQuestDate, player.streakShieldActive, now);
  if (streakUpdate.shieldConsumed) player.streakShieldActive = false;
  if (streakUpdate.streakBroken) player.currentStreak = 0;

  // Passo 3: incrementa se giorno nuovo
  if (isNewQuestDay(player.lastQuestDate, now)) {
    player.currentStreak += 1;
  }

  // Passo 4: record personale
  if (player.currentStreak > player.longestStreak) {
    player.longestStreak = player.currentStreak;
  }

  // Passo 5: XP, livello e monete guadagnate
  const multiplier = computeStreakMultiplier(player.currentStreak);
  const xpAwarded = computeXpAwarded(questType, player.currentStreak);
  const coinsAwarded = Math.round(basePoints * multiplier);
  const prevLevel = computeLevelFromXp(player.xp);
  player.xp += xpAwarded;
  const newLevelData = computeLevelFromXp(player.xp);
  const levelUp = newLevelData.level > prevLevel.level;

  // Passo 6: shield guadagnato (usa streakShieldActive attuale, potenzialmente azzerato al passo 2)
  const earnShield = shouldEarnShield(player.currentStreak, player.streakShieldActive);
  if (earnShield) player.streakShieldActive = true;

  // Passo 7: lastQuestDate = oggi senza ora
  const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  player.lastQuestDate = todayDate;

  // Passo 8: update con $inc atomico sulle monete; returnDocument 'after'
  // per leggere il saldo realmente persistito (non un valore stantio)
  const updated = await Player.findByIdAndUpdate(
    playerId,
    {
      xp: player.xp,
      level: newLevelData.level,
      currentStreak: player.currentStreak,
      longestStreak: player.longestStreak,
      lastQuestDate: player.lastQuestDate,
      streakShieldActive: player.streakShieldActive,
      $inc: { totalPoints: coinsAwarded },
    },
    { returnDocument: 'after' },
  );

  await addWeeklyXpToLeague(playerId, xpAwarded);

  return {
    gamification: {
      xpAwarded,
      coinsAwarded,
      streakMultiplier: multiplier,
      currentStreak: player.currentStreak,
      longestStreak: player.longestStreak,
      newLevel: levelUp ? newLevelData.level : null,
      levelTitle: newLevelData.title,
      totalXp: player.xp,
      shieldEarned: earnShield,
      shieldConsumed: streakUpdate.shieldConsumed,
      streakBroken: streakUpdate.streakBroken,
    },
    totalPoints: updated?.totalPoints ?? player.totalPoints + coinsAwarded,
  };
}

/**
 * Risultato dell'accredito diretto di XP e monete.
 */
export interface XpCoinsAwardResult {
  totalXp: number;
  totalPoints: number;
  level: number;
}

/**
 * Accredita XP e monete fuori dal flusso di completamento quest
 * (onboarding, missioni giornaliere, eventi).
 *
 * Mantiene gli invarianti che applyGamification garantisce per i
 * completamenti: il livello viene ricalcolato dagli XP aggiornati e gli
 * XP confluiscono nel weeklyXp della lega corrente. Senza questo helper
 * il campo level resterebbe stantio rispetto a levelTitle (calcolato
 * dagli XP a ogni lettura del profilo).
 */
export async function awardXpAndCoins(
  playerId: string,
  xpAmount: number,
  coinsAmount: number,
): Promise<XpCoinsAwardResult> {
  const updated = await Player.findByIdAndUpdate(
    playerId,
    { $inc: { xp: xpAmount, totalPoints: coinsAmount } },
    { returnDocument: 'after' },
  );
  if (!updated) {
    throw new NotFoundError('Giocatore non trovato', 'PLAYER_NOT_FOUND');
  }

  const levelData = computeLevelFromXp(updated.xp);
  if (levelData.level !== updated.level) {
    await Player.updateOne({ _id: playerId }, { level: levelData.level });
  }

  if (xpAmount > 0) {
    await addWeeklyXpToLeague(playerId, xpAmount);
  }

  return { totalXp: updated.xp, totalPoints: updated.totalPoints, level: levelData.level };
}

export interface StreakLazyResult {
  player: IPlayer;
  shieldConsumed: boolean;
  streakBroken: boolean;
}

/**
 * Verifica lazy della streak al GET /player/me.
 *
 * Aggiorna il DB SOLO se necessario (shield consumato o streak azzerata),
 * non scrive a ogni lettura del profilo.
 * Ritorna il player aggiornato piu' i flag informativi per la response.
 */
export async function checkStreakLazy(playerId: string): Promise<StreakLazyResult> {
  const player = await Player.findById(playerId);
  if (!player) {
    throw new NotFoundError('Giocatore non trovato', 'PLAYER_NOT_FOUND');
  }

  const update = computeStreakUpdate(player.lastQuestDate, player.streakShieldActive, new Date());

  if (!update.shieldConsumed && !update.streakBroken) {
    return { player, shieldConsumed: false, streakBroken: false };
  }

  const changes: Record<string, unknown> = {};
  if (update.shieldConsumed) changes.streakShieldActive = false;
  if (update.streakBroken) changes.currentStreak = 0;

  const updated = await Player.findByIdAndUpdate(playerId, changes, { returnDocument: 'after' });
  return {
    player: updated ?? player,
    shieldConsumed: update.shieldConsumed,
    streakBroken: update.streakBroken,
  };
}
