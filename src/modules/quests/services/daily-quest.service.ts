import {
  DailyQuestAssignment,
  DailyQuestType,
  DailyQuestContext,
} from '../../../database/models/DailyQuest.model';
import { Player } from '../../../database/models/User.model';
import { DAILY_QUEST_POOL } from '../../../config/daily-quests.config';
import { NotFoundError } from '../../../utils/errors';
import { DailyQuestAssignmentView } from '@trentino-quest/shared-types';

function todayString(): string {
  return new Date().toISOString().split('T')[0];
}

function pickThreeRandom<T>(arr: T[]): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
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
    const picked = pickThreeRandom(pool);
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

export async function completeDailyQuest(
  playerId: string,
  questType: DailyQuestType,
): Promise<{ xpAwarded: number; coinsAwarded: number; alreadyCompleted: boolean }> {
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
    return { xpAwarded: 0, coinsAwarded: 0, alreadyCompleted: true };
  }

  quest.completed = true;
  quest.completedAt = new Date();
  await assignment.save();

  await Player.findByIdAndUpdate(playerId, {
    $inc: { xp: quest.xpReward, coins: quest.coinsReward },
  });

  return { xpAwarded: quest.xpReward, coinsAwarded: quest.coinsReward, alreadyCompleted: false };
}
