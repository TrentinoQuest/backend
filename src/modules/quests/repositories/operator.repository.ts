import { Types } from 'mongoose';
import { randomBytes } from 'node:crypto';
import {
  PrimaryQuest,
  IPrimaryQuest,
  PlacementStatus,
  GeoJsonPoint,
} from '../../../database/models/Quest.model';

/**
 * Repository per le operazioni dell'Operatore Manutenzione sul ciclo di
 * vita fisico dei QR code delle quest principali.
 *
 * Lavora esclusivamente sul discriminator PrimaryQuest: le quest
 * secondarie non hanno QR fisici e non sono di competenza dell'operatore.
 */

/**
 * Genera un token QR univoco per una quest principale.
 *
 * Stesso schema usato dal seed: prefisso 'qr_' seguito da 16 byte
 * casuali in esadecimale. La probabilita' di collisione e' trascurabile;
 * l'indice unique+sparse su qrToken garantisce comunque un fallimento
 * esplicito in caso di collisione.
 */
export function generateQrToken(): string {
  return 'qr_' + randomBytes(16).toString('hex');
}

/**
 * Filtro per la lista delle quest principali lato operatore.
 */
export interface ListOperatorQuestsFilter {
  placementStatus?: PlacementStatus;
  limit: number;
  offset: number;
}

/**
 * Risultato paginato per la lista operatore.
 */
export interface ListOperatorQuestsResult {
  data: IPrimaryQuest[];
  total: number;
}

/**
 * Restituisce la lista paginata delle quest principali, opzionalmente
 * filtrate per stato di piazzamento.
 *
 * A differenza della lista admin, qui filtriamo esplicitamente sul
 * discriminator primary (le secondarie non riguardano l'operatore) e
 * sul placementStatus, che e' la dimensione organizzativa del lavoro
 * dell'operatore.
 */
export async function listPrimaryQuestsByPlacement(
  filter: ListOperatorQuestsFilter,
): Promise<ListOperatorQuestsResult> {
  const query: Record<string, unknown> = {};
  if (filter.placementStatus) {
    query.placementStatus = filter.placementStatus;
  }

  const [data, total] = await Promise.all([
    PrimaryQuest.find(query).sort({ createdAt: -1 }).skip(filter.offset).limit(filter.limit),
    PrimaryQuest.countDocuments(query),
  ]);

  return { data, total };
}

/**
 * Recupera una quest principale per id. Ritorna null se non esiste o
 * se l'id si riferisce a una quest secondaria.
 */
export async function findPrimaryQuestById(id: string): Promise<IPrimaryQuest | null> {
  if (!Types.ObjectId.isValid(id)) {
    return null;
  }
  return PrimaryQuest.findById(id);
}

/**
 * Registra il piazzamento fisico di un QR code: imposta la posizione
 * esatta, genera il token QR univoco e porta placementStatus a PLACED.
 *
 * Ritorna il documento aggiornato o null se l'id non corrisponde a una
 * quest principale.
 */
export async function setQuestPlacement(
  id: string,
  exactPosition: GeoJsonPoint,
  qrToken: string,
): Promise<IPrimaryQuest | null> {
  if (!Types.ObjectId.isValid(id)) {
    return null;
  }
  return PrimaryQuest.findByIdAndUpdate(
    id,
    {
      exactPosition,
      qrToken,
      placementStatus: PlacementStatus.PLACED,
    },
    { new: true, runValidators: true },
  );
}

/**
 * Aggiorna la sola posizione esatta di un QR gia' piazzato (RF41).
 * Non rigenera il token ne' cambia lo stato: il QR fisico e' lo stesso,
 * cambia solo la sua posizione registrata.
 */
export async function updateQuestExactPosition(
  id: string,
  exactPosition: GeoJsonPoint,
): Promise<IPrimaryQuest | null> {
  if (!Types.ObjectId.isValid(id)) {
    return null;
  }
  return PrimaryQuest.findByIdAndUpdate(id, { exactPosition }, { new: true, runValidators: true });
}

/**
 * Segnala un QR come mancante o danneggiato (RF44): porta
 * placementStatus a REPORTED. La quest dovrebbe essere disattivata
 * a livello di servizio per non risultare completabile da QR rotto.
 */
export async function setQuestReported(id: string): Promise<IPrimaryQuest | null> {
  if (!Types.ObjectId.isValid(id)) {
    return null;
  }
  return PrimaryQuest.findByIdAndUpdate(
    id,
    { placementStatus: PlacementStatus.REPORTED },
    { new: true },
  );
}
