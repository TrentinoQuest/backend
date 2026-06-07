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
 * Applica la logica di gamification dopo un completamento.
 *
 * Aggiorna xp, level, streak, streakShieldActive sul Player in modo
 * atomico. Ritorna i dati da includere nella risposta del completamento.
 *
 * Ordine delle operazioni:
 * 1. Carica il Player
 * 2. Calcola lo stato streak (shield consumato / streak azzerata)
 * 3. Incrementa streak se giorno nuovo
 * 4. Aggiorna longestStreak
 * 5. Calcola XP e nuovo livello
 * 6. Verifica se guadagna shield
 * 7. Aggiorna lastQuestDate
 * 8. Persiste con findByIdAndUpdate
 */
export async function applyGamification(
  playerId: string,
  questType: QuestType,
): Promise<GamificationResult> {
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

  // Passo 5: XP, livello e monete
  const multiplier = computeStreakMultiplier(player.currentStreak);
  const xpAwarded = computeXpAwarded(questType, player.currentStreak);
  const coinsAwarded = Math.round(
    questType === QuestType.PRIMARY ? 25 * multiplier : 10 * multiplier,
  );
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

  // Passo 8: update atomico (gamification + coins)
  await Player.findByIdAndUpdate(playerId, {
    xp: player.xp,
    level: newLevelData.level,
    currentStreak: player.currentStreak,
    longestStreak: player.longestStreak,
    lastQuestDate: player.lastQuestDate,
    streakShieldActive: player.streakShieldActive,
    $inc: { coins: coinsAwarded },
  });

  // Aggiorna weeklyXp nella lega corrente (fire-and-forget)
  try {
    const activeSeason = await LeagueSeason.findOne({ active: true });
    if (activeSeason) {
      await LeagueMembership.updateOne(
        { playerId, seasonId: activeSeason._id },
        { $inc: { weeklyXp: xpAwarded } },
      );
    }
  } catch {
    // non bloccare la risposta se la lega non è configurata
  }

  return {
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
  };
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
