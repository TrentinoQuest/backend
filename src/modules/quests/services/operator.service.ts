import { NotFoundError, ConflictError } from '../../../utils/errors';
import { IPrimaryQuest, PlacementStatus, QuestStatus } from '../../../database/models/Quest.model';
import {
  listPrimaryQuestsByPlacement,
  findPrimaryQuestById,
  setQuestPlacedPosition,
  updateQuestExactPosition,
  setQuestReported,
  ListOperatorQuestsFilter,
} from '../repositories/operator.repository';
import { setQuestStatus } from '../repositories/quest.repository';
import { geoPointToGeoJson, validateGeoFix, GeoFixQualityMetadata } from '../utils/geo.utils';
import { GeoPoint } from '../utils/geo.utils';

/**
 * Service del modulo quests, parte relativa alle operazioni
 * dell'Operatore Manutenzione (interfaccia IOperatorOps del D2).
 *
 * Gestisce il ciclo di vita fisico dei QR code delle quest principali:
 * piazzamento (RF40), aggiornamento posizione (RF41), liste operative
 * filtrate per stato (RF42/43/45), segnalazione di QR rotti (RF44).
 *
 * Le quest secondarie non sono di competenza dell'operatore: non hanno
 * QR fisici.
 */

export interface OperatorListResult {
  data: IPrimaryQuest[];
  total: number;
  limit: number;
  offset: number;
}

/**
 * Restituisce la lista paginata delle quest principali filtrate per
 * stato di piazzamento.
 */
export async function listQuestsForOperator(filter: {
  placementStatus?: PlacementStatus;
  limit: number;
  offset: number;
}): Promise<OperatorListResult> {
  const repoFilter: ListOperatorQuestsFilter = {
    placementStatus: filter.placementStatus,
    limit: filter.limit,
    offset: filter.offset,
  };
  const { data, total } = await listPrimaryQuestsByPlacement(repoFilter);
  return { data, total, limit: filter.limit, offset: filter.offset };
}

/**
 * Recupera una quest principale per id o lancia NotFoundError.
 */
export async function getPrimaryQuestForOperator(id: string): Promise<IPrimaryQuest> {
  const quest = await findPrimaryQuestById(id);
  if (!quest) {
    throw new NotFoundError('Quest principale non trovata', 'QUEST_NOT_FOUND');
  }
  return quest;
}

/**
 * Registra il piazzamento fisico di un QR code (RF40).
 *
 * Nel modello adottato il qrToken viene generato in anticipo dall'admin
 * e stampato; l'operatore arriva sul posto col QR gia' stampato, lo
 * affigge e lo scansiona. Lo scannedToken letto dal QR fisico viene
 * verificato contro il token atteso per la quest: questo intercetta
 * l'errore di affiggere il QR sbagliato nel punto sbagliato.
 *
 * Valida l'eventuale fix GPS (anti-cheat) e verifica che la quest non
 * sia gia' piazzata (per ripiazzare si usa l'aggiornamento posizione).
 */
export async function placeQuest(
  id: string,
  exactPosition: GeoPoint,
  scannedToken: string,
  fix?: GeoFixQualityMetadata,
): Promise<IPrimaryQuest> {
  if (fix) {
    validateGeoFix(fix);
  }

  const quest = await findPrimaryQuestById(id);
  if (!quest) {
    throw new NotFoundError('Quest principale non trovata', 'QUEST_NOT_FOUND');
  }
  if (!quest.qrToken) {
    throw new ConflictError(
      'QR non ancora generato per questa quest: generarlo dal backoffice admin',
      'QUEST_QR_NOT_GENERATED',
    );
  }
  if (quest.placementStatus === PlacementStatus.PLACED) {
    throw new ConflictError(
      "QR gia' piazzato: usa l'aggiornamento posizione",
      'QUEST_ALREADY_PLACED',
    );
  }
  if (scannedToken !== quest.qrToken) {
    throw new ConflictError(
      'Il QR scansionato non corrisponde a questa quest',
      'QR_TOKEN_MISMATCH',
    );
  }

  const updated = await setQuestPlacedPosition(id, geoPointToGeoJson(exactPosition));
  if (!updated) {
    throw new NotFoundError('Quest principale non trovata', 'QUEST_NOT_FOUND');
  }
  return updated;
}
/**
 * Aggiorna la posizione di un QR gia' piazzato (RF41).
 *
 * Valida l'eventuale fix GPS e verifica che il QR sia effettivamente in
 * stato PLACED: non ha senso aggiornare la posizione di un QR mai
 * piazzato o segnalato come mancante.
 */
export async function updateQuestPosition(
  id: string,
  exactPosition: GeoPoint,
  fix?: GeoFixQualityMetadata,
): Promise<IPrimaryQuest> {
  if (fix) {
    validateGeoFix(fix);
  }

  const quest = await findPrimaryQuestById(id);
  if (!quest) {
    throw new NotFoundError('Quest principale non trovata', 'QUEST_NOT_FOUND');
  }
  if (quest.placementStatus !== PlacementStatus.PLACED) {
    throw new ConflictError(
      'Il QR non risulta piazzato: usa prima il piazzamento',
      'QUEST_NOT_PLACED',
    );
  }

  const updated = await updateQuestExactPosition(id, geoPointToGeoJson(exactPosition));
  if (!updated) {
    throw new NotFoundError('Quest principale non trovata', 'QUEST_NOT_FOUND');
  }
  return updated;
}

/**
 * Segnala un QR come mancante o danneggiato (RF44).
 *
 * Porta placementStatus a REPORTED e, come effetto collaterale di
 * sicurezza, disattiva la quest (status INACTIVE) cosi' che non risulti
 * completabile finche' il QR non viene ripristinato. Una quest con QR
 * rotto ma ancora attiva genererebbe frustrazione nei giocatori.
 *
 * Il parametro note e' accettato per estensione futura (audit log delle
 * segnalazioni) ma non persistito nello schema attuale.
 */
export async function reportQuestIssue(id: string, _note?: string): Promise<IPrimaryQuest> {
  const quest = await findPrimaryQuestById(id);
  if (!quest) {
    throw new NotFoundError('Quest principale non trovata', 'QUEST_NOT_FOUND');
  }

  const updated = await setQuestReported(id);
  if (!updated) {
    throw new NotFoundError('Quest principale non trovata', 'QUEST_NOT_FOUND');
  }

  // Disattiva la quest: con QR rotto non deve essere completabile.
  if (updated.status === QuestStatus.ACTIVE) {
    await setQuestStatus(id, QuestStatus.INACTIVE);
    updated.status = QuestStatus.INACTIVE;
  }

  return updated;
}
