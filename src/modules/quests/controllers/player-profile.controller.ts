import { Request, Response, NextFunction } from 'express';
import type {
  Player,
  CompletionEntry,
  CollectibleEntry,
  ProgressSummary,
  AnyQuest,
} from '@trentino-quest/shared-types';
import { listCompletionsQuerySchema, progressQuerySchema } from '../validators/quests.validators';
import {
  getPlayerCompletions,
  getPlayerCollection,
  getPlayerProgress,
  CompletionEntry as ServiceCompletionEntry,
  CollectibleEntry as ServiceCollectibleEntry,
} from '../services/player-profile.service';
import { checkStreakLazy, StreakLazyResult } from '../services/gamification.service';
import { getValleyProgress } from '../services/valley.service';
import { getDailyQuests, completeDailyQuest } from '../services/daily-quest.service';
import { UnauthorizedError, BadRequestError } from '../../../utils/errors';
import { DailyQuestContext, DailyQuestType } from '../../../database/models/DailyQuest.model';
import { z } from 'zod';
import { IUser, IPlayer } from '../../../database/models/User.model';
import {
  IQuest,
  IPrimaryQuest,
  ISecondaryQuest,
  QuestType,
} from '../../../database/models/Quest.model';
import { ICollectible } from '../../../database/models/Collectible.model';
import { ICompletion } from '../../../database/models/Completion.model';
import { computeLevelFromXp, computeXpToNextLevel } from '../../../config/gamification';

/**
 * Serializza il giocatore per la response, escludendo la password
 * e aggiungendo i campi calcolati levelTitle e xpToNextLevel.
 */
function serializePlayer(user: IUser): Player {
  const obj = user.toObject({ versionKey: false });
  delete (obj as Record<string, unknown>).password;
  const player = user as IPlayer;
  const { title: levelTitle } = computeLevelFromXp(player.xp ?? 0);
  const xpToNextLevel = computeXpToNextLevel(player.xp ?? 0);
  return {
    ...obj,
    id: String(user._id),
    levelTitle,
    xpToNextLevel,
  } as unknown as Player;
}

function serializeQuest(quest: IQuest): AnyQuest {
  const base = {
    id: String(quest._id),
    name: quest.name,
    description: quest.description,
    status: quest.status,
    basePoints: quest.basePoints,
    createdAt: quest.createdAt.toISOString(),
  };

  if (quest.type === QuestType.PRIMARY) {
    const primary = quest as IPrimaryQuest;
    return {
      ...base,
      type: QuestType.PRIMARY,
      searchArea: {
        lat: primary.searchArea.coordinates[1],
        lng: primary.searchArea.coordinates[0],
      },
      searchRadiusMeters: primary.searchRadiusMeters,
      collectibleId: primary.collectibleId ? String(primary.collectibleId) : null,
      placementStatus: primary.placementStatus,
    };
  }

  const secondary = quest as ISecondaryQuest;
  return {
    ...base,
    type: QuestType.SECONDARY,
    position: {
      lat: secondary.position.coordinates[1],
      lng: secondary.position.coordinates[0],
    },
    checkInRadiusMeters: secondary.checkInRadiusMeters,
  };
}

function serializeCompletion(completion: ICompletion): CompletionEntry['completion'] {
  return {
    id: String(completion._id),
    questId: String(completion.questId),
    pointsAwarded: completion.pointsAwarded,
    position: {
      lat: completion.position.coordinates[1],
      lng: completion.position.coordinates[0],
    },
    completedAt: completion.completedAt.toISOString(),
  };
}

function serializeCollectible(collectible: ICollectible): CollectibleEntry['collectible'] {
  return {
    id: String(collectible._id),
    name: collectible.name,
    description: collectible.description,
    imageUrl: collectible.imageUrl,
    rarity: collectible.rarity,
    createdAt: collectible.createdAt.toISOString(),
    status: collectible.status,
    lore: collectible.lore ?? null,
    coordinates: collectible.coordinates
      ? {
          lat: collectible.coordinates.coordinates[1],
          lng: collectible.coordinates.coordinates[0],
        }
      : null,
  };
}

function serializeCompletionEntry(entry: ServiceCompletionEntry): CompletionEntry {
  return {
    completion: serializeCompletion(entry.completion),
    quest: serializeQuest(entry.quest),
  };
}

function serializeCollectibleEntry(entry: ServiceCollectibleEntry): CollectibleEntry {
  return {
    collectible: serializeCollectible(entry.collectible),
    unlockedAt: entry.unlockedAt.toISOString(),
  };
}

/**
 * Handler per GET /player/me.
 *
 * Prima del profilo esegue il check lazy della streak: se il giocatore
 * e' stato inattivo, aggiorna streak/shield nel DB (solo se necessario).
 */
export async function getPlayerMeHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) {
      throw new UnauthorizedError('Autenticazione richiesta', 'AUTH_REQUIRED');
    }
    const { player, shieldConsumed, streakBroken }: StreakLazyResult = await checkStreakLazy(
      String(req.user._id),
    );
    res.status(200).json({ ...serializePlayer(player), shieldConsumed, streakBroken });
  } catch (err) {
    next(err);
  }
}

/**
 * Handler per GET /player/completions.
 *
 * Restituisce il feed dei completamenti del giocatore in ordine cronologico
 * decrescente, paginato.
 */
export async function listPlayerCompletionsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) {
      throw new UnauthorizedError('Autenticazione richiesta', 'AUTH_REQUIRED');
    }
    const query = listCompletionsQuerySchema.parse(req.query);
    const entries = await getPlayerCompletions(req.user, query.limit, query.offset);
    const response: CompletionEntry[] = entries.map(serializeCompletionEntry);
    res.status(200).json(response);
  } catch (err) {
    next(err);
  }
}

/**
 * Handler per GET /player/collection.
 *
 * Restituisce l'album dei collezionabili sbloccati dal giocatore.
 */
export async function getPlayerCollectionHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) {
      throw new UnauthorizedError('Autenticazione richiesta', 'AUTH_REQUIRED');
    }
    const entries = await getPlayerCollection(req.user);
    const response: CollectibleEntry[] = entries.map(serializeCollectibleEntry);
    res.status(200).json(response);
  } catch (err) {
    next(err);
  }
}

/**
 * Handler per GET /player/progress.
 *
 * Restituisce il riepilogo dei progressi del giocatore, eventualmente
 * filtrato per zona.
 */
export async function getPlayerProgressHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) {
      throw new UnauthorizedError('Autenticazione richiesta', 'AUTH_REQUIRED');
    }
    const query = progressQuerySchema.parse(req.query);
    const summary = await getPlayerProgress(req.user, query.zone);
    const response: ProgressSummary = {
      totalQuests: summary.totalQuests,
      completedQuests: summary.completedQuests,
      percentage: summary.percentage,
    };
    res.status(200).json(response);
  } catch (err) {
    next(err);
  }
}

export async function getValleyProgressHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw new UnauthorizedError('Autenticazione richiesta', 'AUTH_REQUIRED');
    const progress = await getValleyProgress(String(req.user._id));
    res.status(200).json(progress);
  } catch (err) {
    next(err);
  }
}

const dailyQuestsQuerySchema = z.object({
  context: z
    .enum(['in_trentino', 'out_of_region'] as [string, ...string[]])
    .default('in_trentino')
    .transform((v) => v as DailyQuestContext),
});

export async function getDailyQuestsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw new UnauthorizedError('Autenticazione richiesta', 'AUTH_REQUIRED');
    const { context } = dailyQuestsQuerySchema.parse(req.query);
    const data = await getDailyQuests(String(req.user._id), context);
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

export async function completeDailyQuestHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw new UnauthorizedError('Autenticazione richiesta', 'AUTH_REQUIRED');
    const questType = req.params.type as DailyQuestType;
    if (!Object.values(DailyQuestType).includes(questType)) {
      throw new BadRequestError('Tipo missione non valido', 'INVALID_QUEST_TYPE');
    }
    const result = await completeDailyQuest(String(req.user._id), questType);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}
