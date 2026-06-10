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
 * Coordinate accettate in input dal CRUD nel formato dell'API REST {lat,lng}.
 * `null` rimuove esplicitamente le coordinate, `undefined` (chiave assente)
 * le lascia invariate in fase di update.
 */
type CoordinatesInput = { lat: number; lng: number } | null | undefined;

/**
 * Converte le coordinate {lat,lng} dell'API nel formato GeoJSON persistito
 * nel modello (coerente con il seed e con i serializer). Restituisce
 * `undefined` quando la chiave non e' fornita, cosi' l'update parziale non
 * tocca il campo; `null` per la rimozione esplicita.
 */
function coordinatesToGeoJson(
  coordinates: CoordinatesInput,
): ICollectible['coordinates'] | undefined {
  if (coordinates === undefined) {
    return undefined;
  }
  if (coordinates === null) {
    return null;
  }
  return { type: 'Point', coordinates: [coordinates.lng, coordinates.lat] };
}

/**
 * Campi scrivibili di un collezionabile dal CRUD amministrativo.
 */
interface CollectibleWriteInput {
  name: string;
  description: string;
  imageUrl: string;
  rarity: ICollectible['rarity'];
  lore?: string | null;
  coordinates?: CoordinatesInput;
}

/**
 * Crea un nuovo collezionabile.
 *
 * Le coordinate in input arrivano nel formato API {lat,lng} e vengono
 * convertite in GeoJSON prima della persistenza, per restare coerenti con
 * il formato atteso dai serializer e prodotto dal seed.
 */
export async function createCollectible(data: CollectibleWriteInput): Promise<ICollectible> {
  const { coordinates, ...rest } = data;
  return Collectible.create({
    ...rest,
    coordinates: coordinatesToGeoJson(coordinates) ?? null,
  });
}

/**
 * Aggiorna i campi modificabili di un collezionabile esistente.
 * Restituisce il documento aggiornato o null se l'id non esiste.
 */
export async function updateCollectible(
  id: string,
  data: Partial<CollectibleWriteInput>,
): Promise<ICollectible | null> {
  if (!Types.ObjectId.isValid(id)) {
    return null;
  }
  const { coordinates, ...rest } = data;
  const update: Record<string, unknown> = { ...rest };
  const geoCoordinates = coordinatesToGeoJson(coordinates);
  if (geoCoordinates !== undefined) {
    update.coordinates = geoCoordinates;
  }
  return Collectible.findByIdAndUpdate(id, update, {
    returnDocument: 'after',
    runValidators: true,
  });
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
