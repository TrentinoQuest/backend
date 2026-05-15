import { Types } from 'mongoose';
import {
  Quest,
  IQuest,
  IPrimaryQuest,
  ISecondaryQuest,
  QuestType,
  QuestStatus,
  GeoJsonPoint,
} from '../../../database/models/Quest.model';

/**
 * Repository del modulo quests per la collection 'quests'.
 *
 * Espone le query Mongoose necessarie agli use case del player-side
 * (lista, dettaglio, validazione per completamento). Le operazioni di
 * scrittura (create/update/delete) saranno aggiunte quando arriveranno
 * gli endpoint admin e operator.
 *
 * Convenzione interna: tutti i parametri di posizione GPS sono accettati
 * in formato GeoJsonPoint, gia' convertito dal service. Cosi' il
 * repository resta puramente focalizzato sulla persistenza, senza
 * preoccuparsi della trasformazione dei formati.
 */

/**
 * Filtri opzionali per la query di lista delle quest.
 *
 * Quando near + maxDistanceMeters sono forniti, viene applicato un filtro
 * geografico $near su searchArea (primary) o position (secondary). La
 * query MongoDB $near richiede un indice 2dsphere, gia' presente sui
 * rispettivi campi dei discriminator.
 */
export interface ListQuestsFilter {
  type?: QuestType;
  near?: GeoJsonPoint;
  maxDistanceMeters?: number;
  status?: QuestStatus;
}

/**
 * Costruisce la query Mongoose per il filtro $near a partire dai parametri
 * geografici opzionali. Ritorna un oggetto vuoto se i parametri non sono
 * sufficienti per applicare il filtro.
 *
 * Il filtro viene applicato sia a searchArea (campo delle quest principali)
 * sia a position (campo delle quest secondarie) tramite $or: cosi' la
 * stessa query restituisce entrambi i tipi di quest entro il raggio.
 */
function buildGeoFilter(near?: GeoJsonPoint, maxDistanceMeters?: number): Record<string, unknown> {
  if (!near || maxDistanceMeters === undefined) {
    return {};
  }
  const geoNear = {
    $near: {
      $geometry: near,
      $maxDistance: maxDistanceMeters,
    },
  };
  return {
    $or: [{ searchArea: geoNear }, { position: geoNear }],
  };
}

/**
 * Restituisce l'elenco delle quest che soddisfano i filtri specificati.
 *
 * Il filtro di default include solo le quest attive: il giocatore non
 * deve vedere quest inattive o archiviate sulla mappa.
 */
export async function listQuests(filter: ListQuestsFilter = {}): Promise<IQuest[]> {
  const statusFilter = filter.status ?? QuestStatus.ACTIVE;
  const baseFilter: Record<string, unknown> = { status: statusFilter };

  if (filter.type) {
    baseFilter.type = filter.type;
  }

  const geoFilter = buildGeoFilter(filter.near, filter.maxDistanceMeters);
  const finalFilter = { ...baseFilter, ...geoFilter };

  return Quest.find(finalFilter).sort({ createdAt: -1 });
}

/**
 * Recupera una quest specifica per id.
 *
 * Restituisce null se l'id non esiste. La conversione del tipo specifico
 * (PrimaryQuest o SecondaryQuest) avviene automaticamente grazie al
 * discriminator pattern di Mongoose: il documento ritornato avra' tutti
 * i campi del tipo corrispondente.
 */
export async function findQuestById(id: string): Promise<IQuest | null> {
  if (!Types.ObjectId.isValid(id)) {
    return null;
  }
  return Quest.findById(id);
}

/**
 * Recupera una quest principale per il valore del suo QR token.
 *
 * Utilizzato durante il processo di scansione: il giocatore presenta il
 * token estratto dal QR code, il service lo verifica contro la quest
 * registrata. Ritorna null se il token non corrisponde ad alcuna quest
 * attiva.
 */
export async function findPrimaryQuestByQrToken(qrToken: string): Promise<IPrimaryQuest | null> {
  const quest = await Quest.findOne({
    type: QuestType.PRIMARY,
    qrToken,
    status: QuestStatus.ACTIVE,
  });
  return quest as IPrimaryQuest | null;
}

/**
 * Conta le quest attive che soddisfano un filtro opzionale.
 *
 * Utilizzato dall'endpoint /player/progress per calcolare il totale di
 * quest disponibili da rapportare ai completamenti del giocatore.
 */
export async function countActiveQuests(filter: { type?: QuestType } = {}): Promise<number> {
  const query: Record<string, unknown> = { status: QuestStatus.ACTIVE };
  if (filter.type) {
    query.type = filter.type;
  }
  return Quest.countDocuments(query);
}

/**
 * Type guard runtime per riconoscere una quest primaria a partire dal
 * tipo base IQuest. Utilizzato dal service per accedere ai campi
 * specifici dopo una findById generica.
 */
export function isPrimaryQuest(quest: IQuest): quest is IPrimaryQuest {
  return quest.type === QuestType.PRIMARY;
}

/**
 * Type guard runtime per le quest secondarie.
 */
export function isSecondaryQuest(quest: IQuest): quest is ISecondaryQuest {
  return quest.type === QuestType.SECONDARY;
}

import { PrimaryQuest, SecondaryQuest } from '../../../database/models/Quest.model';

/**
 * Input per la creazione di una quest secondaria.
 *
 * Lo status di default e' INACTIVE: la quest viene attivata esplicitamente
 * solo quando l'admin la rende disponibile ai giocatori.
 */
export interface CreateSecondaryQuestInput {
  name: string;
  description: string;
  basePoints: number;
  position: GeoJsonPoint;
  checkInRadiusMeters: number;
  status?: QuestStatus;
}

/**
 * Input per la creazione di una quest principale.
 *
 * NON include exactPosition, qrToken, validationRadiusMeters: questi
 * campi vengono popolati successivamente dal flusso operatore.
 */
export interface CreatePrimaryQuestInput {
  name: string;
  description: string;
  basePoints: number;
  searchArea: GeoJsonPoint;
  searchRadiusMeters: number;
  collectibleId?: Types.ObjectId | null;
  status?: QuestStatus;
}

/**
 * Crea una nuova quest secondaria nel database.
 */
export async function createSecondaryQuest(
  input: CreateSecondaryQuestInput,
): Promise<ISecondaryQuest> {
  return SecondaryQuest.create({
    name: input.name,
    description: input.description,
    basePoints: input.basePoints,
    position: input.position,
    checkInRadiusMeters: input.checkInRadiusMeters,
    status: input.status ?? QuestStatus.INACTIVE,
  });
}

/**
 * Crea una nuova quest principale nel database.
 */
export async function createPrimaryQuest(input: CreatePrimaryQuestInput): Promise<IPrimaryQuest> {
  return PrimaryQuest.create({
    name: input.name,
    description: input.description,
    basePoints: input.basePoints,
    searchArea: input.searchArea,
    searchRadiusMeters: input.searchRadiusMeters,
    collectibleId: input.collectibleId ?? null,
    status: input.status ?? QuestStatus.INACTIVE,
  });
}

/**
 * Input per l'aggiornamento di una quest esistente.
 *
 * Tutti i campi sono opzionali. I campi specifici di un tipo (es.
 * searchArea per le primary) vanno applicati solo a quest di quel tipo:
 * la validazione e' responsabilita' del service.
 */
export interface UpdateQuestInput {
  name?: string;
  description?: string;
  basePoints?: number;
  searchArea?: GeoJsonPoint;
  searchRadiusMeters?: number;
  collectibleId?: Types.ObjectId | null;
  position?: GeoJsonPoint;
  checkInRadiusMeters?: number;
}

/**
 * Aggiorna i campi specificati di una quest esistente.
 *
 * Ritorna il documento aggiornato o null se l'id non esiste. Usa
 * findByIdAndUpdate con runValidators per applicare gli stessi vincoli
 * di validazione del create.
 */
export async function updateQuest(id: string, input: UpdateQuestInput): Promise<IQuest | null> {
  if (!Types.ObjectId.isValid(id)) {
    return null;
  }
  return Quest.findByIdAndUpdate(id, input, { new: true, runValidators: true });
}

/**
 * Aggiorna lo status di una quest. Usato per activate/deactivate/archive.
 */
export async function setQuestStatus(id: string, status: QuestStatus): Promise<IQuest | null> {
  if (!Types.ObjectId.isValid(id)) {
    return null;
  }
  return Quest.findByIdAndUpdate(id, { status }, { new: true });
}

/**
 * Filtri per la lista admin delle quest.
 *
 * Diversamente dal filtro player-side, qui lo status puo' essere
 * qualsiasi valore (inclusi INACTIVE e ARCHIVED): l'admin deve poter
 * vedere tutte le quest del sistema, non solo quelle visibili ai
 * giocatori.
 */
export interface ListQuestsAdminFilter {
  type?: QuestType;
  status?: QuestStatus;
  limit: number;
  offset: number;
}

/**
 * Risultato paginato per la lista admin.
 */
export interface ListQuestsAdminResult {
  data: IQuest[];
  total: number;
}

/**
 * Restituisce la lista paginata delle quest per l'amministratore.
 *
 * Diversamente da listQuests del player-side, accetta uno status
 * esplicito (puo' essere INACTIVE o ARCHIVED) e non applica filtri
 * geografici.
 */
export async function listQuestsAdmin(
  filter: ListQuestsAdminFilter,
): Promise<ListQuestsAdminResult> {
  const query: Record<string, unknown> = {};
  if (filter.type) {
    query.type = filter.type;
  }
  if (filter.status) {
    query.status = filter.status;
  }

  const [data, total] = await Promise.all([
    Quest.find(query).sort({ createdAt: -1 }).skip(filter.offset).limit(filter.limit),
    Quest.countDocuments(query),
  ]);

  return { data, total };
}
