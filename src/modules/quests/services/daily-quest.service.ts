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

function todayString(): string {
  return new Date().toISOString().split('T')[0];
}

function getDayOfYear(date: Date): number {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date.getTime() - start.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function pickThreeDeterministic<T>(arr: T[]): T[] {
  const day = getDayOfYear(new Date());
  const step = Math.floor(arr.length / 3);
  const indices = [0, 1, 2].map((i) => (day * 3 + i * step) % arr.length);
  return indices.map((i) => arr[i]);
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
