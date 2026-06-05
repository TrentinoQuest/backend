import { Request, Response, NextFunction } from 'express';
import type { AnyQuest, CheckInResponse, ScanQrResponse } from '@trentino-quest/shared-types';
import {
  listQuestsQuerySchema,
  objectIdParamSchema,
  checkInSchema,
  scanQrSchema,
} from '../validators/quests.validators';
import { getQuests, getQuestById, checkIn, scanQr } from '../services/quest.service';
import { UnauthorizedError } from '../../../utils/errors';
import {
  IQuest,
  IPrimaryQuest,
  ISecondaryQuest,
  QuestType,
} from '../../../database/models/Quest.model';
import { ICompletion } from '../../../database/models/Completion.model';
import { ICollectible } from '../../../database/models/Collectible.model';

/**
 * Serializza una quest per la response HTTP.
 *
 * Converte il documento Mongoose nel formato AnyQuest definito in
 * shared-types. La conversione e' specifica per tipo: le quest principali
 * espongono searchArea+searchRadiusMeters+collectibleId, le secondarie
 * position+checkInRadiusMeters.
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
 * Serializza un completamento per la response HTTP.
 */
function serializeCompletion(completion: ICompletion): CheckInResponse['completion'] {
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

/**
 * Serializza un collezionabile per la response HTTP.
 */
function serializeCollectible(collectible: ICollectible): ScanQrResponse['collectible'] {
  return {
    id: String(collectible._id),
    name: collectible.name,
    description: collectible.description,
    imageUrl: collectible.imageUrl,
    rarity: collectible.rarity,
    createdAt: collectible.createdAt.toISOString(),
    status: collectible.status,
    lore: collectible.lore ?? null,
    audioGuideUrl: collectible.audioGuideUrl ?? null,
    coordinates: collectible.coordinates
      ? { lat: collectible.coordinates.coordinates[1], lng: collectible.coordinates.coordinates[0] }
      : null,
  };
}

/**
 * Handler per GET /quests.
 *
 * Restituisce l'elenco delle quest visibili al giocatore con eventuali
 * filtri geografici e per tipo.
 */
export async function listQuestsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const query = listQuestsQuerySchema.parse(req.query);
    const quests = await getQuests({
      type: query.type,
      maxDistanceMeters: query.radiusMeters,
      near:
        query.lat !== undefined && query.lng !== undefined
          ? { lat: query.lat, lng: query.lng }
          : undefined,
    });
    res.status(200).json(quests.map(serializeQuest));
  } catch (err) {
    next(err);
  }
}

/**
 * Handler per GET /quests/:id.
 *
 * Restituisce il dettaglio di una quest specifica. Risponde 404 se la
 * quest non esiste.
 */
export async function getQuestByIdHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const params = objectIdParamSchema.parse(req.params);
    const quest = await getQuestById(params.id);
    res.status(200).json(serializeQuest(quest));
  } catch (err) {
    next(err);
  }
}

/**
 * Handler per POST /quests/:id/check-in.
 *
 * Completa una quest secondaria con check-in geolocalizzato. Richiede
 * autenticazione: l'utente attivo viene letto da req.user popolato dal
 * middleware authenticate.
 *
 * Se il body include il campo opzionale `fix` (shared-types v0.5.0+),
 * il service applica la validazione anti-cheat sulla qualita' del
 * fix GPS prima di procedere col completamento.
 */
export async function checkInHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) {
      throw new UnauthorizedError('Autenticazione richiesta', 'AUTH_REQUIRED');
    }
    const params = objectIdParamSchema.parse(req.params);
    const body = checkInSchema.parse(req.body);

    const result = await checkIn(req.user, params.id, body.position, body.fix);

    const response: CheckInResponse = {
      completion: serializeCompletion(result.completion),
      pointsAwarded: result.pointsAwarded,
      totalPoints: result.totalPoints,
      distanceFromTargetMeters: result.distanceFromTargetMeters,
      gamification: result.gamification,
    };
    res.status(201).json(response);
  } catch (err) {
    next(err);
  }
}

/**
 * Handler per POST /quests/:id/scan.
 *
 * Completa una quest principale tramite scansione del QR code. Richiede
 * autenticazione.
 *
 * Se il body include il campo opzionale `fix` (shared-types v0.5.0+),
 * il service applica la validazione anti-cheat sulla qualita' del
 * fix GPS prima di procedere col completamento.
 */
export async function scanQrHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) {
      throw new UnauthorizedError('Autenticazione richiesta', 'AUTH_REQUIRED');
    }
    const params = objectIdParamSchema.parse(req.params);
    const body = scanQrSchema.parse(req.body);

    const result = await scanQr(req.user, params.id, body.qrToken, body.position, body.fix);

    const response: ScanQrResponse = {
      completion: serializeCompletion(result.completion),
      pointsAwarded: result.pointsAwarded,
      totalPoints: result.totalPoints,
      collectible: serializeCollectible(result.collectible),
      distanceFromTargetMeters: result.distanceFromTargetMeters,
      gamification: result.gamification,
    };
    res.status(201).json(response);
  } catch (err) {
    next(err);
  }
}
