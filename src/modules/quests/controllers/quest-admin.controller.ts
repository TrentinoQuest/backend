import { Request, Response, NextFunction } from 'express';
import type { AnyQuest, ListAdminQuestsResponse } from '@trentino-quest/shared-types';
import {
  createQuestSchema,
  updateQuestSchema,
  listAdminQuestsQuerySchema,
  objectIdParamSchema,
} from '../validators/quest-admin.validators';
import {
  listQuestsForAdmin,
  getQuestForAdmin,
  createQuest,
  updateQuestForAdmin,
  activateQuest,
  deactivateQuest,
  archiveQuest,
} from '../services/quest-admin.service';
import {
  IQuest,
  IPrimaryQuest,
  ISecondaryQuest,
  QuestType,
} from '../../../database/models/Quest.model';

/**
 * Serializza una quest per la response HTTP admin.
 *
 * Identica struttura alla serializzazione player-side. Duplicata qui per
 * mantenere il controller admin autoconsistente, evitando dipendenze tra
 * controller dello stesso modulo.
 */
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
      qrToken: primary.qrToken ?? null,
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

/**
 * Handler per GET /admin/quests.
 */
export async function listAdminQuestsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const query = listAdminQuestsQuerySchema.parse(req.query);
    const result = await listQuestsForAdmin(query);
    const response: ListAdminQuestsResponse = {
      data: result.data.map(serializeQuest),
      total: result.total,
      limit: result.limit,
      offset: result.offset,
    };
    res.status(200).json(response);
  } catch (err) {
    next(err);
  }
}

/**
 * Handler per GET /admin/quests/:id.
 */
export async function getAdminQuestByIdHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const params = objectIdParamSchema.parse(req.params);
    const quest = await getQuestForAdmin(params.id);
    res.status(200).json(serializeQuest(quest));
  } catch (err) {
    next(err);
  }
}

/**
 * Handler per POST /admin/quests.
 */
export async function createAdminQuestHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const input = createQuestSchema.parse(req.body);
    const quest = await createQuest(input);
    res.status(201).json(serializeQuest(quest));
  } catch (err) {
    next(err);
  }
}

/**
 * Handler per PATCH /admin/quests/:id.
 */
export async function updateAdminQuestHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const params = objectIdParamSchema.parse(req.params);
    const input = updateQuestSchema.parse(req.body);
    const quest = await updateQuestForAdmin(params.id, input);
    res.status(200).json(serializeQuest(quest));
  } catch (err) {
    next(err);
  }
}

/**
 * Handler per DELETE /admin/quests/:id.
 * Implementa soft-delete: la quest viene archiviata, non rimossa.
 */
export async function archiveAdminQuestHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const params = objectIdParamSchema.parse(req.params);
    await archiveQuest(params.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

/**
 * Handler per POST /admin/quests/:id/activate.
 */
export async function activateAdminQuestHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const params = objectIdParamSchema.parse(req.params);
    const quest = await activateQuest(params.id);
    res.status(200).json(serializeQuest(quest));
  } catch (err) {
    next(err);
  }
}

/**
 * Handler per POST /admin/quests/:id/deactivate.
 */
export async function deactivateAdminQuestHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const params = objectIdParamSchema.parse(req.params);
    const quest = await deactivateQuest(params.id);
    res.status(200).json(serializeQuest(quest));
  } catch (err) {
    next(err);
  }
}
