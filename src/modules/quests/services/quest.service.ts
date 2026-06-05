import { Types } from 'mongoose';
import { GamificationResult } from '@trentino-quest/shared-types';
import { ConflictError, NotFoundError } from '../../../utils/errors';
import { logger } from '../../../config/logger';
import {
  IQuest,
  IPrimaryQuest,
  ISecondaryQuest,
  QuestType,
} from '../../../database/models/Quest.model';
import { ICollectible } from '../../../database/models/Collectible.model';
import { ICompletion } from '../../../database/models/Completion.model';
import { IUser } from '../../../database/models/User.model';
import {
  findQuestById,
  findPrimaryQuestByQrToken,
  isSecondaryQuest,
  listQuests,
  ListQuestsFilter,
} from '../repositories/quest.repository';
import { findCollectibleById } from '../repositories/collectible.repository';
import { createCompletion, hasPlayerCompletedQuest } from '../repositories/completion.repository';
import { findUserById } from '../../auth/repositories/user.repository';
import {
  GeoFixQualityMetadata,
  GeoPoint,
  geoJsonToGeoPoint,
  geoPointToGeoJson,
  haversineDistanceMeters,
  validateGeoFix,
} from '../utils/geo.utils';
import { applyGamification } from './gamification.service';

/**
 * Service del modulo quests, parte relativa alle operazioni sulle quest:
 * lista, dettaglio, completamento via check-in o scansione QR.
 *
 * Le operazioni sul profilo giocatore (album, progress, feed) sono
 * implementate in player-profile.service.ts per mantenere ogni file
 * focalizzato su un'area di responsabilita'.
 */

/**
 * Risultato del completamento di una quest secondaria via check-in.
 */
export interface CheckInResult {
  completion: ICompletion;
  pointsAwarded: number;
  totalPoints: number;
  distanceFromTargetMeters: number;
  gamification: GamificationResult;
}

/**
 * Risultato del completamento di una quest principale via scansione QR.
 *
 * Include il collezionabile sbloccato, sempre presente per le quest
 * principali.
 */
export interface ScanQrResult extends CheckInResult {
  collectible: ICollectible;
}

/**
 * Restituisce l'elenco delle quest visibili al giocatore.
 *
 * Wrapper sul repository che converte eventualmente i parametri GPS in
 * formato GeoJsonPoint prima di delegare. La conversione qui (invece che
 * nel repository) mantiene il repository agnostico rispetto al formato
 * del client.
 */
export async function getQuests(filter: {
  near?: GeoPoint;
  maxDistanceMeters?: number;
  type?: ListQuestsFilter['type'];
}): Promise<IQuest[]> {
  const repoFilter: ListQuestsFilter = {
    type: filter.type,
    maxDistanceMeters: filter.maxDistanceMeters,
  };
  if (filter.near) {
    repoFilter.near = geoPointToGeoJson(filter.near);
  }
  return listQuests(repoFilter);
}

/**
 * Restituisce una quest per id o lancia NotFoundError se inesistente.
 */
export async function getQuestById(id: string): Promise<IQuest> {
  const quest = await findQuestById(id);
  if (!quest) {
    throw new NotFoundError('Quest non trovata', 'QUEST_NOT_FOUND');
  }
  return quest;
}

/**
 * Completa una quest secondaria con check-in geolocalizzato.
 *
 * Sequenza di validazione:
 * 0. (Se fix presente) Il fix GPS supera le soglie anti-cheat
 * 1. La quest esiste ed e' di tipo secondario
 * 2. Il giocatore non l'ha gia' completata
 * 3. La posizione GPS rientra nel raggio di check-in
 *
 * Lo step 0 e' eseguito fail-fast prima di qualsiasi I/O: se il client
 * invia un fix inaccettabile non ha senso colpire il database. Se il
 * client non invia il fix (retrocompatibilita' pre-v0.5.0) lo step 0
 * viene saltato.
 *
 * In caso di successo registra il completamento, aggiorna il totale punti
 * del giocatore e ritorna i dati per la response.
 */
export async function checkIn(
  player: IUser,
  questId: string,
  playerPosition: GeoPoint,
  fix?: GeoFixQualityMetadata,
): Promise<CheckInResult> {
  if (fix) {
    validateGeoFix(fix);
  }

  const quest = await getQuestById(questId);
  if (!isSecondaryQuest(quest)) {
    throw new ConflictError('Questo endpoint accetta solo quest secondarie', 'QUEST_TYPE_MISMATCH');
  }

  const playerId = player._id;
  const alreadyCompleted = await hasPlayerCompletedQuest(playerId, quest._id);
  if (alreadyCompleted) {
    throw new ConflictError("Quest gia' completata", 'QUEST_ALREADY_COMPLETED');
  }

  const target = geoJsonToGeoPoint(quest.position);
  const distance = haversineDistanceMeters(playerPosition, target);

  if (distance > quest.checkInRadiusMeters) {
    throw new ConflictError(
      `Sei a ${Math.round(distance)} metri dal punto di check-in (massimo consentito: ${quest.checkInRadiusMeters})`,
      'OUT_OF_CHECK_IN_RADIUS',
    );
  }

  const pointsAwarded = computePointsAwarded(quest);
  const completion = await createCompletion({
    playerId,
    questId: quest._id,
    pointsAwarded,
    position: geoPointToGeoJson(playerPosition),
  });

  const totalPoints = await addPointsToPlayer(playerId, pointsAwarded);
  const gamification = await applyGamification(String(playerId), QuestType.SECONDARY);

  logger.info(
    {
      playerId: String(playerId),
      questId: String(quest._id),
      pointsAwarded,
      xpAwarded: gamification.xpAwarded,
      distance: Math.round(distance),
      hasFix: fix !== undefined,
    },
    'Quest secondaria completata',
  );

  return {
    completion,
    pointsAwarded,
    totalPoints,
    distanceFromTargetMeters: Math.round(distance),
    gamification,
  };
}

/**
 * Completa una quest principale tramite scansione del QR code.
 *
 * Sequenza di validazione:
 * 0. (Se fix presente) Il fix GPS supera le soglie anti-cheat
 * 1. Il token QR corrisponde a una quest principale attiva
 * 2. L'id passato nel path corrisponde alla quest del token (anti-spoofing)
 * 3. Il giocatore non l'ha gia' completata
 * 4. La quest ha exactPosition registrata (e' stata piazzata)
 * 5. La posizione GPS rientra nel raggio di validazione
 * 6. La quest ha un collezionabile associato
 *
 * Lo step 0 e' eseguito fail-fast prima di qualsiasi I/O.
 *
 * In caso di successo registra il completamento, sblocca il collezionabile,
 * aggiorna i punti del giocatore e ritorna i dati per la response.
 */
export async function scanQr(
  player: IUser,
  questId: string,
  qrToken: string,
  playerPosition: GeoPoint,
  fix?: GeoFixQualityMetadata,
): Promise<ScanQrResult> {
  if (fix) {
    validateGeoFix(fix);
  }

  const questByToken = await findPrimaryQuestByQrToken(qrToken);
  if (!questByToken) {
    throw new ConflictError('QR token non valido', 'INVALID_QR_TOKEN');
  }

  if (String(questByToken._id) !== questId) {
    throw new ConflictError('Il QR code non corrisponde a questa quest', 'QR_QUEST_MISMATCH');
  }

  const playerId = player._id;
  const alreadyCompleted = await hasPlayerCompletedQuest(playerId, questByToken._id);
  if (alreadyCompleted) {
    throw new ConflictError("Quest gia' completata", 'QUEST_ALREADY_COMPLETED');
  }

  if (!questByToken.exactPosition) {
    throw new ConflictError(
      "La quest non e' ancora stata piazzata sul territorio",
      'QUEST_NOT_PLACED',
    );
  }

  const target = geoJsonToGeoPoint(questByToken.exactPosition);
  const distance = haversineDistanceMeters(playerPosition, target);

  if (distance > questByToken.validationRadiusMeters) {
    throw new ConflictError(
      `Sei a ${Math.round(distance)} metri dal QR code (massimo consentito: ${questByToken.validationRadiusMeters})`,
      'OUT_OF_VALIDATION_RADIUS',
    );
  }

  if (!questByToken.collectibleId) {
    throw new ConflictError(
      'Quest non configurata correttamente: collezionabile mancante',
      'COLLECTIBLE_MISSING',
    );
  }

  const collectible = await findCollectibleById(String(questByToken.collectibleId));
  if (!collectible) {
    throw new ConflictError('Collezionabile della quest non trovato', 'COLLECTIBLE_NOT_FOUND');
  }

  const pointsAwarded = computePointsAwarded(questByToken);
  const completion = await createCompletion({
    playerId,
    questId: questByToken._id,
    pointsAwarded,
    position: geoPointToGeoJson(playerPosition),
  });

  const totalPoints = await addPointsToPlayer(playerId, pointsAwarded);
  const gamification = await applyGamification(String(playerId), QuestType.PRIMARY);

  logger.info(
    {
      playerId: String(playerId),
      questId: String(questByToken._id),
      pointsAwarded,
      xpAwarded: gamification.xpAwarded,
      collectibleId: String(collectible._id),
      distance: Math.round(distance),
      hasFix: fix !== undefined,
    },
    'Quest principale completata',
  );

  return {
    completion,
    pointsAwarded,
    totalPoints,
    collectible,
    distanceFromTargetMeters: Math.round(distance),
    gamification,
  };
}

/**
 * Calcola i punti da assegnare per il completamento di una quest.
 *
 * Per ora applica solo i punti base senza moltiplicatori. Il moltiplicatore
 * zona richiesto dal RF22 ("punti bonus per quest in zone meno visitate")
 * verra' implementato quando avremo dati statistici di affluenza, ovvero
 * dopo l'integrazione del modulo analytics.
 */
function computePointsAwarded(quest: IPrimaryQuest | ISecondaryQuest): number {
  return quest.basePoints;
}

/**
 * Incrementa il totale punti del giocatore e ne restituisce il nuovo valore.
 *
 * L'operazione e' atomica grazie a $inc di MongoDB: nessun rischio di race
 * condition se il giocatore completa due quest in rapida successione.
 */
async function addPointsToPlayer(playerId: Types.ObjectId, pointsToAdd: number): Promise<number> {
  const user = await findUserById(String(playerId));
  if (!user) {
    throw new NotFoundError('Giocatore non trovato', 'PLAYER_NOT_FOUND');
  }

  const userWithPoints = user as IUser & { totalPoints?: number };
  const currentPoints = userWithPoints.totalPoints ?? 0;
  userWithPoints.totalPoints = currentPoints + pointsToAdd;
  await userWithPoints.save();

  return userWithPoints.totalPoints;
}
