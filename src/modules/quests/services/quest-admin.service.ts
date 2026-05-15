import { Types } from 'mongoose';
import { NotFoundError, ConflictError, BadRequestError } from '../../../utils/errors';
import { IQuest, QuestStatus, QuestType } from '../../../database/models/Quest.model';
import { QuestType as ApiQuestType } from '@trentino-quest/shared-types';
import {
  createPrimaryQuest,
  createSecondaryQuest,
  findQuestById,
  isPrimaryQuest,
  isSecondaryQuest,
  listQuestsAdmin,
  ListQuestsAdminFilter,
  setQuestStatus,
  updateQuest,
  UpdateQuestInput,
} from '../repositories/quest.repository';
import { findCollectibleById } from '../repositories/collectible.repository';
import { geoPointToGeoJson } from '../utils/geo.utils';
import {
  CreateQuestInput,
  CreatePrimaryQuestInput,
  CreateSecondaryQuestInput,
  UpdateQuestInput as UpdateQuestValidatorInput,
} from '../validators/quest-admin.validators';

/**
 * Service del modulo quests, parte relativa alle operazioni admin.
 *
 * Implementa l'interfaccia IQuestAdmin del Deliverable D2: creazione,
 * modifica, attivazione/disattivazione, archiviazione delle quest.
 *
 * Le operazioni player-side sono in quest.service.ts; le operazioni
 * dell'operatore di manutenzione saranno aggiunte in operator.service.ts.
 */

/**
 * Risultato paginato della lista admin delle quest.
 */
export interface AdminListResult {
  data: IQuest[];
  total: number;
  limit: number;
  offset: number;
}

/**
 * Restituisce la lista paginata delle quest per l'amministratore.
 * A differenza dell'endpoint player-side, include anche quest INACTIVE
 * e ARCHIVED.
 */
export async function listQuestsForAdmin(filter: {
  type?: QuestType;
  status?: QuestStatus;
  limit: number;
  offset: number;
}): Promise<AdminListResult> {
  const repoFilter: ListQuestsAdminFilter = {
    type: filter.type,
    status: filter.status,
    limit: filter.limit,
    offset: filter.offset,
  };
  const { data, total } = await listQuestsAdmin(repoFilter);
  return { data, total, limit: filter.limit, offset: filter.offset };
}

/**
 * Restituisce una quest per id (qualsiasi status) o lancia NotFoundError.
 *
 * A differenza della versione player-side, l'admin puo' vedere anche
 * quest non attive.
 */
export async function getQuestForAdmin(id: string): Promise<IQuest> {
  const quest = await findQuestById(id);
  if (!quest) {
    throw new NotFoundError('Quest non trovata', 'QUEST_NOT_FOUND');
  }
  return quest;
}

/**
 * Crea una nuova quest a partire dall'input validato.
 *
 * Determina automaticamente il tipo in base al campo discriminator e
 * delega al repository corrispondente. Se viene fornito un collectibleId
 * (solo per quest primary), verifica che il collezionabile esista.
 */
export async function createQuest(input: CreateQuestInput): Promise<IQuest> {
  if (input.type === ApiQuestType.PRIMARY) {
    return createPrimaryQuestForAdmin(input);
  }
  return createSecondaryQuestForAdmin(input);
}

async function createSecondaryQuestForAdmin(input: CreateSecondaryQuestInput): Promise<IQuest> {
  return createSecondaryQuest({
    name: input.name,
    description: input.description,
    basePoints: input.basePoints,
    position: geoPointToGeoJson(input.position),
    checkInRadiusMeters: input.checkInRadiusMeters,
  });
}

async function createPrimaryQuestForAdmin(input: CreatePrimaryQuestInput): Promise<IQuest> {
  if (input.collectibleId) {
    const collectible = await findCollectibleById(input.collectibleId);
    if (!collectible) {
      throw new NotFoundError('Collezionabile non trovato', 'COLLECTIBLE_NOT_FOUND');
    }
  }

  return createPrimaryQuest({
    name: input.name,
    description: input.description,
    basePoints: input.basePoints,
    searchArea: geoPointToGeoJson(input.searchArea),
    searchRadiusMeters: input.searchRadiusMeters,
    collectibleId: input.collectibleId ? new Types.ObjectId(input.collectibleId) : null,
  });
}

/**
 * Aggiorna i campi specificati di una quest esistente.
 *
 * Verifica che i campi specifici di un tipo siano applicati solo a quest
 * di quel tipo, altrimenti lancia BadRequestError. Se viene aggiornato
 * collectibleId, verifica che il nuovo collezionabile esista.
 */
export async function updateQuestForAdmin(
  id: string,
  input: UpdateQuestValidatorInput,
): Promise<IQuest> {
  const existing = await findQuestById(id);
  if (!existing) {
    throw new NotFoundError('Quest non trovata', 'QUEST_NOT_FOUND');
  }

  if (isSecondaryQuest(existing)) {
    if (
      input.searchArea !== undefined ||
      input.searchRadiusMeters !== undefined ||
      input.collectibleId !== undefined
    ) {
      throw new BadRequestError(
        'Campi non applicabili a quest secondaria',
        'INVALID_FIELDS_FOR_TYPE',
      );
    }
  }

  if (isPrimaryQuest(existing)) {
    if (input.position !== undefined || input.checkInRadiusMeters !== undefined) {
      throw new BadRequestError(
        'Campi non applicabili a quest principale',
        'INVALID_FIELDS_FOR_TYPE',
      );
    }
  }

  if (input.collectibleId) {
    const collectible = await findCollectibleById(input.collectibleId);
    if (!collectible) {
      throw new NotFoundError('Collezionabile non trovato', 'COLLECTIBLE_NOT_FOUND');
    }
  }

  const updates: UpdateQuestInput = {};
  if (input.name !== undefined) updates.name = input.name;
  if (input.description !== undefined) updates.description = input.description;
  if (input.basePoints !== undefined) updates.basePoints = input.basePoints;
  if (input.searchArea !== undefined) {
    updates.searchArea = geoPointToGeoJson(input.searchArea);
  }
  if (input.searchRadiusMeters !== undefined) {
    updates.searchRadiusMeters = input.searchRadiusMeters;
  }
  if (input.collectibleId !== undefined) {
    updates.collectibleId = input.collectibleId ? new Types.ObjectId(input.collectibleId) : null;
  }
  if (input.position !== undefined) {
    updates.position = geoPointToGeoJson(input.position);
  }
  if (input.checkInRadiusMeters !== undefined) {
    updates.checkInRadiusMeters = input.checkInRadiusMeters;
  }

  const updated = await updateQuest(id, updates);
  if (!updated) {
    throw new NotFoundError('Quest non trovata', 'QUEST_NOT_FOUND');
  }
  return updated;
}

/**
 * Cambia lo status di una quest in ACTIVE.
 *
 * Verifica che la quest sia attivabile: una quest principale puo'
 * diventare ACTIVE solo se ha exactPosition e qrToken popolati (cioe'
 * se l'operatore l'ha gia' piazzata).
 */
export async function activateQuest(id: string): Promise<IQuest> {
  const quest = await findQuestById(id);
  if (!quest) {
    throw new NotFoundError('Quest non trovata', 'QUEST_NOT_FOUND');
  }

  if (isPrimaryQuest(quest) && (!quest.exactPosition || !quest.qrToken)) {
    throw new ConflictError(
      "La quest principale non puo' essere attivata finche' non viene piazzata dall'operatore",
      'QUEST_NOT_PLACED',
    );
  }

  const updated = await setQuestStatus(id, QuestStatus.ACTIVE);
  if (!updated) {
    throw new NotFoundError('Quest non trovata', 'QUEST_NOT_FOUND');
  }
  return updated;
}

/**
 * Cambia lo status di una quest in INACTIVE.
 *
 * La quest non sara' piu' visibile ai giocatori ma resta nel sistema e
 * puo' essere riattivata in futuro.
 */
export async function deactivateQuest(id: string): Promise<IQuest> {
  const updated = await setQuestStatus(id, QuestStatus.INACTIVE);
  if (!updated) {
    throw new NotFoundError('Quest non trovata', 'QUEST_NOT_FOUND');
  }
  return updated;
}

/**
 * Soft-delete: archivia una quest.
 *
 * La quest viene marcata come ARCHIVED ma non rimossa dal database,
 * preservando l'integrita' referenziale dei completamenti gia' fatti
 * dai giocatori e mantenendo le statistiche storiche consultabili.
 */
export async function archiveQuest(id: string): Promise<void> {
  const updated = await setQuestStatus(id, QuestStatus.ARCHIVED);
  if (!updated) {
    throw new NotFoundError('Quest non trovata', 'QUEST_NOT_FOUND');
  }
}
