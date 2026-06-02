import { Types } from 'mongoose';
import { Business, IBusiness } from '../../../database/models/User.model';
import { BusinessApprovalStatus } from '@trentino-quest/shared-types';

/**
 * Repository per la gestione delle Attivita Locali (discriminator Business
 * della collection users).
 */

export interface ListBusinessesFilter {
  approvalStatus?: BusinessApprovalStatus;
  limit: number;
  offset: number;
}

export interface ListBusinessesResult {
  data: IBusiness[];
  total: number;
}

/**
 * Recupera un'attivita per id. Ritorna null se l'id non e' valido o se
 * non esiste un'attivita con quell'id.
 */
export async function findBusinessById(id: string): Promise<IBusiness | null> {
  if (!Types.ObjectId.isValid(id)) {
    return null;
  }
  return Business.findById(id);
}

/**
 * Recupera un'attivita per email.
 */
export async function findBusinessByEmail(email: string): Promise<IBusiness | null> {
  return Business.findOne({ email: email.toLowerCase() });
}

/**
 * Crea una nuova attivita locale in stato PENDING.
 * La password viene hashata automaticamente dal middleware pre-save di User.
 */
export async function createBusiness(data: {
  email: string;
  password: string;
  businessName: string;
  businessType: IBusiness['businessType'];
  address: string;
  position: { type: 'Point'; coordinates: [number, number] };
}): Promise<IBusiness> {
  return Business.create(data);
}

/**
 * Lista paginata delle attivita, opzionalmente filtrate per stato di
 * approvazione. Usata dall'admin per gestire le affiliazioni.
 */
export async function listBusinesses(filter: ListBusinessesFilter): Promise<ListBusinessesResult> {
  const query: Record<string, unknown> = {};
  if (filter.approvalStatus) {
    query.approvalStatus = filter.approvalStatus;
  }

  const [data, total] = await Promise.all([
    Business.find(query).sort({ createdAt: -1 }).skip(filter.offset).limit(filter.limit),
    Business.countDocuments(query),
  ]);

  return { data, total };
}

/**
 * Aggiorna i campi del profilo aziendale.
 */
export async function updateBusinessProfile(
  id: string,
  data: Partial<{
    businessName: string;
    businessType: IBusiness['businessType'];
    address: string;
    position: { type: 'Point'; coordinates: [number, number] };
  }>,
): Promise<IBusiness | null> {
  if (!Types.ObjectId.isValid(id)) {
    return null;
  }
  return Business.findByIdAndUpdate(id, data, { new: true, runValidators: true });
}

/**
 * Imposta lo stato di approvazione di un'attivita (approve/reject, RF38).
 */
export async function setBusinessApprovalStatus(
  id: string,
  status: BusinessApprovalStatus,
): Promise<IBusiness | null> {
  if (!Types.ObjectId.isValid(id)) {
    return null;
  }
  return Business.findByIdAndUpdate(id, { approvalStatus: status }, { new: true });
}
