import { Request, Response, NextFunction } from 'express';
import type { OperatorQuestView, ListOperatorQuestsResponse } from '@trentino-quest/shared-types';
import {
  objectIdParamSchema,
  placeQuestSchema,
  updatePositionSchema,
  reportIssueSchema,
  listOperatorQuestsQuerySchema,
} from '../validators/operator.validators';
import {
  listQuestsForOperator,
  getPrimaryQuestForOperator,
  placeQuest,
  updateQuestPosition,
  reportQuestIssue,
} from '../services/operator.service';
import { IPrimaryQuest } from '../../../database/models/Quest.model';

/**
 * Serializza una quest principale nella vista operatore.
 *
 * Diversamente dalla serializzazione player/admin, espone i dati
 * operativi del QR: placementStatus e exactPosition (quest'ultima null
 * finche' il QR non e' piazzato). L'operatore ha bisogno di questi
 * dati per il proprio lavoro sul territorio.
 */
function serializeOperatorQuest(quest: IPrimaryQuest): OperatorQuestView {
  return {
    id: String(quest._id),
    name: quest.name,
    description: quest.description,
    status: quest.status,
    basePoints: quest.basePoints,
    createdAt: quest.createdAt.toISOString(),
    type: 'primary',
    searchArea: {
      lat: quest.searchArea.coordinates[1],
      lng: quest.searchArea.coordinates[0],
    },
    searchRadiusMeters: quest.searchRadiusMeters,
    collectibleId: quest.collectibleId ? String(quest.collectibleId) : null,
    placementStatus: quest.placementStatus,
    exactPosition: quest.exactPosition
      ? {
          lat: quest.exactPosition.coordinates[1],
          lng: quest.exactPosition.coordinates[0],
        }
      : null,
    qrToken: quest.qrToken ?? null,
  } as OperatorQuestView;
}

/**
 * Handler per GET /operator/quests.
 * Lista paginata delle quest principali filtrate per stato di
 * piazzamento (RF42/43/45).
 */
export async function listOperatorQuestsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const query = listOperatorQuestsQuerySchema.parse(req.query);
    const result = await listQuestsForOperator(query);
    const response: ListOperatorQuestsResponse = {
      data: result.data.map(serializeOperatorQuest),
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
 * Handler per GET /operator/quests/:id.
 */
export async function getOperatorQuestHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const params = objectIdParamSchema.parse(req.params);
    const quest = await getPrimaryQuestForOperator(params.id);
    res.status(200).json(serializeOperatorQuest(quest));
  } catch (err) {
    next(err);
  }
}

/**
 * Handler per POST /operator/quests/:id/place.
 * Piazzamento fisico del QR code (RF40).
 */
export async function placeQuestHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const params = objectIdParamSchema.parse(req.params);
    const body = placeQuestSchema.parse(req.body);
    const quest = await placeQuest(params.id, body.exactPosition, body.scannedToken, body.fix);
    res.status(200).json(serializeOperatorQuest(quest));
  } catch (err) {
    next(err);
  }
}

/**
 * Handler per PATCH /operator/quests/:id/position.
 * Aggiornamento posizione di un QR gia' piazzato (RF41).
 */
export async function updatePositionHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const params = objectIdParamSchema.parse(req.params);
    const body = updatePositionSchema.parse(req.body);
    const quest = await updateQuestPosition(params.id, body.exactPosition, body.fix);
    res.status(200).json(serializeOperatorQuest(quest));
  } catch (err) {
    next(err);
  }
}

/**
 * Handler per POST /operator/quests/:id/report-issue.
 * Segnalazione di un QR mancante o danneggiato (RF44).
 */
export async function reportIssueHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const params = objectIdParamSchema.parse(req.params);
    const body = reportIssueSchema.parse(req.body);
    const quest = await reportQuestIssue(params.id, body.note);
    res.status(200).json(serializeOperatorQuest(quest));
  } catch (err) {
    next(err);
  }
}
