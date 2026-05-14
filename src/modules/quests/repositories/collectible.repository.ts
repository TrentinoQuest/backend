import { Types } from 'mongoose';
import { Collectible, ICollectible } from '../../../database/models/Collectible.model';

/**
 * Repository del modulo quests per la collection 'collectibles'.
 *
 * Espone le query Mongoose minime necessarie agli use case del player-side:
 * recupero di un collezionabile per id (durante il completamento di una
 * quest principale) e recupero di una lista di collezionabili per id
 * (per il rendering dell'album personale).
 */

/**
 * Recupera un collezionabile per id.
 *
 * Restituisce null se l'id non e' un ObjectId valido o se il documento
 * non esiste.
 */
export async function findCollectibleById(id: string): Promise<ICollectible | null> {
  if (!Types.ObjectId.isValid(id)) {
    return null;
  }
  return Collectible.findById(id);
}

/**
 * Recupera piu' collezionabili a partire da un elenco di id.
 *
 * Utilizzato per ricostruire l'album del giocatore: il service ottiene
 * l'elenco di collectibleId dai completamenti delle quest principali del
 * giocatore e li passa qui per recuperare i dettagli in una sola query.
 *
 * L'ordine di ritorno NON corrisponde all'ordine degli id in input.
 * Se serve un ordine specifico, il chiamante deve riorganizzare.
 */
export async function findCollectiblesByIds(ids: Types.ObjectId[]): Promise<ICollectible[]> {
  if (ids.length === 0) {
    return [];
  }
  return Collectible.find({ _id: { $in: ids } });
}
