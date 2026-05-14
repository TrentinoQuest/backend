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
import { UnauthorizedError } from '../../../utils/errors';
import { IUser } from '../../../database/models/User.model';
import {
  IQuest,
  IPrimaryQuest,
  ISecondaryQuest,
  QuestType,
} from '../../../database/models/Quest.model';
import { ICollectible } from '../../../database/models/Collectible.model';
import { ICompletion } from '../../../database/models/Completion.model';

/**
 * Serializza l'utente per la response, escludendo la password e altri
 * campi sensibili. Coerente con la versione usata nel controller auth.
 */
function serializePlayer(user: IUser): Player {
  const obj = user.toObject({ versionKey: false });
  delete (obj as Record<string, unknown>).password;
  return {
    ...obj,
    id: String(user._id),
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
 * Restituisce il profilo del giocatore autenticato. L'utente e' gia'
 * stato caricato dal middleware authenticate ed e' disponibile su
 * req.user, quindi questo endpoint non fa query aggiuntive al DB.
 */
export function getPlayerMeHandler(req: Request, res: Response, next: NextFunction): void {
  try {
    if (!req.user) {
      throw new UnauthorizedError('Autenticazione richiesta', 'AUTH_REQUIRED');
    }
    res.status(200).json(serializePlayer(req.user));
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
