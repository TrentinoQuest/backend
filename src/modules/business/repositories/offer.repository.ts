import { Types } from 'mongoose';
import { Offer, IOffer, OfferStatus } from '../../../database/models/Offer.model';

/**
 * Repository per la gestione delle offerte delle Attivita Locali.
 */

/**
 * Recupera un'offerta per id. Ritorna null se l'id non e' valido o se
 * l'offerta non esiste.
 */
export async function findOfferById(id: string): Promise<IOffer | null> {
  if (!Types.ObjectId.isValid(id)) {
    return null;
  }
  return Offer.findById(id);
}

/**
 * Lista le offerte attive di una specifica attivita.
 * Usata sia dall'attivita per gestire le proprie offerte, sia come base
 * per la vista giocatore.
 */
export async function listOffersByBusiness(businessId: string): Promise<IOffer[]> {
  if (!Types.ObjectId.isValid(businessId)) {
    return [];
  }
  return Offer.find({ businessId, status: OfferStatus.ACTIVE }).sort({ createdAt: -1 });
}

/**
 * Lista tutte le offerte attive del sistema (di qualsiasi attivita).
 * Base per la vista giocatore: il service filtrera' poi per attivita
 * approvate.
 */
export async function listAllActiveOffers(): Promise<IOffer[]> {
  return Offer.find({ status: OfferStatus.ACTIVE }).sort({ createdAt: -1 });
}

/**
 * Crea una nuova offerta associata a un'attivita.
 */
export async function createOffer(data: {
  businessId: Types.ObjectId;
  title: string;
  description: string;
  pointsCost: number;
}): Promise<IOffer> {
  return Offer.create(data);
}

/**
 * Aggiorna i campi modificabili di un'offerta.
 */
export async function updateOffer(
  id: string,
  data: Partial<{ title: string; description: string; pointsCost: number }>,
): Promise<IOffer | null> {
  if (!Types.ObjectId.isValid(id)) {
    return null;
  }
  return Offer.findByIdAndUpdate(id, data, { returnDocument: 'after', runValidators: true });
}

/**
 * Archivia un'offerta (soft-delete): imposta status ad ARCHIVED.
 */
export async function archiveOffer(id: string): Promise<IOffer | null> {
  if (!Types.ObjectId.isValid(id)) {
    return null;
  }
  return Offer.findByIdAndUpdate(id, { status: OfferStatus.ARCHIVED }, { returnDocument: 'after' });
}
