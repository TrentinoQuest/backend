import { Types } from 'mongoose';
import {
  Collectible,
  ICollectible,
  CollectibleStatus,
} from '../../../database/models/Collectible.model';

/**
 * Repository del modulo quests per la collection 'collectibles'.
 *
 * Espone le query Mongoose per gli use case del player-side (recupero per
 * id e per lista di id, usati per album e completamenti) e per la gestione
 * amministrativa CRUD dei collezionabili.
 */

/**
 * Recupera un collezionabile per id.
 *
 * Restituisce null se l'id non e' un ObjectId valido o se il documento
 * non esiste. Non filtra per stato: un collezionabile archiviato resta
 * recuperabile per gli album dei giocatori che lo possiedono.
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
 * NON filtra per stato: un collezionabile archiviato deve continuare ad
 * apparire nell'album di chi lo ha gia' sbloccato.
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

/**
 * Restituisce i collezionabili attivi ordinati per data di creazione
 * decrescente. Non e' paginato perche' in produzione si prevedono poche
 * decine di collezionabili al massimo.
 *
 * Filtra solo gli ACTIVE: questa lista alimenta il dropdown di selezione
 * del collezionabile nella creazione/modifica di una quest, dove non ha
 * senso proporre collezionabili archiviati.
 */
export async function listAllCollectibles(): Promise<ICollectible[]> {
  return Collectible.find({ status: CollectibleStatus.ACTIVE }).sort({ createdAt: -1 });
}

/**
 * Crea un nuovo collezionabile.
 */
export async function createCollectible(data: {
  name: string;
  description: string;
  imageUrl: string;
  rarity: ICollectible['rarity'];
}): Promise<ICollectible> {
  return Collectible.create(data);
}

/**
 * Aggiorna i campi modificabili di un collezionabile esistente.
 * Restituisce il documento aggiornato o null se l'id non esiste.
 */
export async function updateCollectible(
  id: string,
  data: Partial<{
    name: string;
    description: string;
    imageUrl: string;
    rarity: ICollectible['rarity'];
  }>,
): Promise<ICollectible | null> {
  if (!Types.ObjectId.isValid(id)) {
    return null;
  }
  return Collectible.findByIdAndUpdate(id, data, { returnDocument: 'after', runValidators: true });
}

/**
 * Archivia un collezionabile (soft-delete): imposta status ad ARCHIVED.
 * Il documento resta nel database per preservare gli album dei giocatori
 * che lo hanno gia' sbloccato. Restituisce il documento aggiornato o null
 * se l'id non esiste.
 */
export async function archiveCollectible(id: string): Promise<ICollectible | null> {
  if (!Types.ObjectId.isValid(id)) {
    return null;
  }
  return Collectible.findByIdAndUpdate(
    id,
    { status: CollectibleStatus.ARCHIVED },
    { returnDocument: 'after' },
  );
}
