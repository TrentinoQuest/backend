import { Types } from 'mongoose';
import { Completion, ICompletion } from '../../../database/models/Completion.model';
import { GeoJsonPoint } from '../../../database/models/Quest.model';

/**
 * Repository del modulo quests per la collection 'completions'.
 *
 * Reifica la relazione N:M tra Giocatore e Quest definita nel Deliverable
 * D2: ogni documento rappresenta il completamento di una specifica quest
 * da parte di uno specifico giocatore.
 */

/**
 * Input per la creazione di un nuovo completion.
 *
 * I valori di pointsAwarded e position vengono calcolati dal service:
 * - pointsAwarded include eventuale moltiplicatore zona applicato a runtime
 * - position e' la posizione GPS dichiarata dal giocatore al check-in
 */
export interface CreateCompletionInput {
  playerId: Types.ObjectId;
  questId: Types.ObjectId;
  pointsAwarded: number;
  position: GeoJsonPoint;
}

/**
 * Persiste un nuovo completamento.
 *
 * Il modello Completion ha un indice unique composto su (playerId, questId)
 * che garantisce a livello di database l'invariante "una quest e'
 * completabile una sola volta per giocatore". Un secondo tentativo di
 * insert con la stessa coppia produrra' un duplicate key error che il
 * service intercetta e traduce in ConflictError applicativo.
 */
export async function createCompletion(input: CreateCompletionInput): Promise<ICompletion> {
  return Completion.create({
    playerId: input.playerId,
    questId: input.questId,
    pointsAwarded: input.pointsAwarded,
    position: input.position,
  });
}

/**
 * Verifica se un giocatore ha gia' completato una specifica quest.
 *
 * Utilizzato dal service prima di tentare un nuovo completamento, per
 * evitare di andare in errore sull'indice unique e poter restituire un
 * messaggio applicativo piu' descrittivo.
 */
export async function hasPlayerCompletedQuest(
  playerId: Types.ObjectId,
  questId: Types.ObjectId,
): Promise<boolean> {
  const count = await Completion.countDocuments({ playerId, questId });
  return count > 0;
}

/**
 * Restituisce i completamenti di un giocatore in ordine cronologico
 * decrescente con paginazione offset/limit.
 *
 * I documenti sono restituiti senza popolazione della quest: il service
 * arricchisce le entry con i dati delle quest a partire dai questId,
 * mantenendo la separazione delle responsabilita' tra repository.
 */
export async function listCompletionsByPlayer(
  playerId: Types.ObjectId,
  limit: number,
  offset: number,
): Promise<ICompletion[]> {
  return Completion.find({ playerId }).sort({ completedAt: -1 }).skip(offset).limit(limit);
}

/**
 * Conta il numero totale di completamenti effettuati da un giocatore.
 *
 * Utilizzato dall'endpoint /player/progress in combinazione con
 * countActiveQuests del quest repository per calcolare la percentuale
 * di completamento.
 */
export async function countCompletionsByPlayer(playerId: Types.ObjectId): Promise<number> {
  return Completion.countDocuments({ playerId });
}

/**
 * Restituisce gli id delle quest completate da un giocatore.
 *
 * Usato in combinazione con findCollectiblesByIds del collectible
 * repository per costruire l'album dei collezionabili del giocatore.
 */
export async function listCompletedQuestIdsByPlayer(
  playerId: Types.ObjectId,
): Promise<Types.ObjectId[]> {
  const completions = await Completion.find({ playerId }, { questId: 1 });
  return completions.map((c) => c.questId);
}
