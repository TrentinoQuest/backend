import type { QueryFilter } from 'mongoose';
import { Types } from 'mongoose';
import { Valley, IValley } from '../../../database/models/Valley.model';
import { Quest, IQuest, QuestStatus } from '../../../database/models/Quest.model';
import { Completion } from '../../../database/models/Completion.model';
import { ValleyProgressItem } from '@trentino-quest/shared-types';

export async function getValleyProgress(playerId: string): Promise<ValleyProgressItem[]> {
  const valleys = await Valley.find();

  const results = await Promise.all(
    valleys.map(async (valley: IValley) => {
      const valleyId = String(valley._id);

      // Quest attive il cui punto geografico cade dentro il poligono della valle
      const geoFilter: QueryFilter<IQuest> = {
        status: QuestStatus.ACTIVE,
        $or: [
          { position: { $geoWithin: { $geometry: valley.polygon } } },
          { searchArea: { $geoWithin: { $geometry: valley.polygon } } },
        ],
      };

      const questsInValley = await Quest.find(geoFilter)
        .select('_id')
        .lean<{ _id: Types.ObjectId }[]>();

      const questIds = questsInValley.map((q) => q._id);
      const totalCount = questIds.length;

      let completedCount = 0;
      let entered = false;

      if (totalCount > 0) {
        const playerCompletions = await Completion.countDocuments({
          playerId,
          questId: { $in: questIds },
        });
        completedCount = playerCompletions;
        entered = completedCount > 0;
      }

      const percentage = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

      return { valleyId, name: valley.name, completedCount, totalCount, percentage, entered };
    }),
  );

  return results;
}
