import { Types } from 'mongoose';
import { ForbiddenError, NotFoundError, ConflictError } from '../../../utils/errors';
import { BusinessApprovalStatus } from '@trentino-quest/shared-types';
import { IBusiness } from '../../../database/models/User.model';
import { IOffer } from '../../../database/models/Offer.model';
import {
  findBusinessById,
  listBusinesses,
  updateBusinessProfile,
  setBusinessApprovalStatus,
  ListBusinessesFilter,
} from '../repositories/business.repository';
import {
  findOfferById,
  listOffersByBusiness,
  listAllActiveOffers,
  createOffer,
  updateOffer,
  archiveOffer,
} from '../repositories/offer.repository';
import { issueTokenPair, AuthResult } from '../../auth/services/auth.service';
import { findUserByEmail } from '../../auth/repositories/user.repository';
import { createBusiness } from '../repositories/business.repository';
import { geoPointToGeoJson } from '../../quests/utils/geo.utils';
import { BusinessType } from '@trentino-quest/shared-types';

/**
 * Service del modulo business: gestione del profilo aziendale e delle
 * offerte (lato attivita), gestione delle affiliazioni (lato admin),
 * visualizzazione offerte (lato giocatore).
 *
 * Il riscatto delle offerte (scansione QR del giocatore e scalo punti)
 * e' previsto come sviluppo futuro e non e' implementato qui.
 */

/* ----------------------------- Lato attivita ---------------------------- */

/**
 * Registra una nuova Attivita Locale (RF28).
 *
 * Crea un account con ruolo business in stato PENDING e restituisce
 * subito la coppia di token, cosi' che l'attivita possa autenticarsi
 * senza un login separato. Finche' l'affiliazione non viene approvata
 * dall'admin, l'attivita puo' loggarsi ma non pubblicare offerte.
 */
export async function registerBusiness(
  input: {
    email: string;
    password: string;
    businessName: string;
    businessType: BusinessType;
    address: string;
    position: { lat: number; lng: number };
  },
  userAgent?: string | null,
): Promise<AuthResult> {
  const existing = await findUserByEmail(input.email);
  if (existing) {
    throw new ConflictError("Email gia' registrata", 'EMAIL_ALREADY_USED');
  }

  const business = await createBusiness({
    email: input.email,
    password: input.password,
    businessName: input.businessName,
    businessType: input.businessType,
    address: input.address,
    position: geoPointToGeoJson(input.position),
  });

  const tokenPair = await issueTokenPair(business, userAgent);
  return { ...tokenPair, user: business };
}

/**
 * Recupera il profilo dell'attivita autenticata.
 */
export async function getBusinessProfile(businessId: string): Promise<IBusiness> {
  const business = await findBusinessById(businessId);
  if (!business) {
    throw new NotFoundError('Attivita non trovata', 'BUSINESS_NOT_FOUND');
  }
  return business;
}

/**
 * Aggiorna il profilo dell'attivita autenticata.
 */
export async function updateOwnBusinessProfile(
  businessId: string,
  data: Parameters<typeof updateBusinessProfile>[1],
): Promise<IBusiness> {
  const updated = await updateBusinessProfile(businessId, data);
  if (!updated) {
    throw new NotFoundError('Attivita non trovata', 'BUSINESS_NOT_FOUND');
  }
  return updated;
}

/**
 * Lista le offerte attive dell'attivita autenticata.
 */
export async function listOwnOffers(businessId: string): Promise<IOffer[]> {
  return listOffersByBusiness(businessId);
}

/**
 * Crea una nuova offerta per conto dell'attivita autenticata (RF29).
 *
 * Vincolo di affiliazione: solo un'attivita APPROVED puo' pubblicare
 * offerte. Un'attivita pending o rejected riceve 403.
 */
export async function createOwnOffer(
  businessId: string,
  data: { title: string; description: string; pointsCost: number },
): Promise<IOffer> {
  const business = await findBusinessById(businessId);
  if (!business) {
    throw new NotFoundError('Attivita non trovata', 'BUSINESS_NOT_FOUND');
  }
  if (business.approvalStatus !== BusinessApprovalStatus.APPROVED) {
    throw new ForbiddenError(
      'Affiliazione non approvata: impossibile pubblicare offerte',
      'BUSINESS_NOT_APPROVED',
    );
  }

  return createOffer({
    businessId: new Types.ObjectId(businessId),
    title: data.title,
    description: data.description,
    pointsCost: data.pointsCost,
  });
}

/**
 * Recupera un'offerta verificando che appartenga all'attivita indicata.
 * Applica i vincoli RF31/RF32: un'attivita gestisce solo le proprie
 * offerte, mai quelle altrui.
 */
async function getOwnedOffer(businessId: string, offerId: string): Promise<IOffer> {
  const offer = await findOfferById(offerId);
  if (!offer) {
    throw new NotFoundError('Offerta non trovata', 'OFFER_NOT_FOUND');
  }
  if (String(offer.businessId) !== businessId) {
    throw new ForbiddenError('Non puoi gestire offerte di altre attivita', 'OFFER_NOT_OWNED');
  }
  return offer;
}

/**
 * Aggiorna un'offerta dell'attivita autenticata.
 */
export async function updateOwnOffer(
  businessId: string,
  offerId: string,
  data: Parameters<typeof updateOffer>[1],
): Promise<IOffer> {
  await getOwnedOffer(businessId, offerId);
  const updated = await updateOffer(offerId, data);
  if (!updated) {
    throw new NotFoundError('Offerta non trovata', 'OFFER_NOT_FOUND');
  }
  return updated;
}

/**
 * Archivia un'offerta dell'attivita autenticata (soft-delete).
 */
export async function archiveOwnOffer(businessId: string, offerId: string): Promise<void> {
  await getOwnedOffer(businessId, offerId);
  await archiveOffer(offerId);
}

/* ------------------------------ Lato admin ------------------------------ */

/**
 * Lista paginata delle attivita per l'admin, filtrabile per stato di
 * approvazione (RF38).
 */
export async function listBusinessesForAdmin(filter: {
  approvalStatus?: BusinessApprovalStatus;
  limit: number;
  offset: number;
}): Promise<{ data: IBusiness[]; total: number; limit: number; offset: number }> {
  const repoFilter: ListBusinessesFilter = {
    approvalStatus: filter.approvalStatus,
    limit: filter.limit,
    offset: filter.offset,
  };
  const { data, total } = await listBusinesses(repoFilter);
  return { data, total, limit: filter.limit, offset: filter.offset };
}

/**
 * Approva l'affiliazione di un'attivita (RF38).
 * Idempotente nei confronti di un'attivita gia' approvata; rifiuta invece
 * di riapprovare un'attivita gia' rejected senza un passaggio esplicito
 * (qui per semplicita' consentiamo la transizione rejected -> approved).
 */
export async function approveBusiness(businessId: string): Promise<IBusiness> {
  const business = await findBusinessById(businessId);
  if (!business) {
    throw new NotFoundError('Attivita non trovata', 'BUSINESS_NOT_FOUND');
  }
  if (business.approvalStatus === BusinessApprovalStatus.APPROVED) {
    throw new ConflictError('Attivita gia approvata', 'BUSINESS_ALREADY_APPROVED');
  }

  const updated = await setBusinessApprovalStatus(businessId, BusinessApprovalStatus.APPROVED);
  if (!updated) {
    throw new NotFoundError('Attivita non trovata', 'BUSINESS_NOT_FOUND');
  }
  return updated;
}

/**
 * Rifiuta l'affiliazione di un'attivita (RF38).
 * La motivazione e' accettata per estensione futura (notifica all'attivita)
 * ma non persistita nello schema attuale.
 */
export async function rejectBusiness(businessId: string, _reason?: string): Promise<IBusiness> {
  const business = await findBusinessById(businessId);
  if (!business) {
    throw new NotFoundError('Attivita non trovata', 'BUSINESS_NOT_FOUND');
  }

  const updated = await setBusinessApprovalStatus(businessId, BusinessApprovalStatus.REJECTED);
  if (!updated) {
    throw new NotFoundError('Attivita non trovata', 'BUSINESS_NOT_FOUND');
  }
  return updated;
}

/* ---------------------------- Lato giocatore ---------------------------- */

/**
 * Lista le offerte visibili ai giocatori: solo offerte attive di attivita
 * approvate. Restituisce le offerte insieme alle attivita di appartenenza
 * per consentire al controller di arricchire la vista.
 */
export async function listOffersForPlayers(): Promise<{
  offers: IOffer[];
  businessesById: Map<string, IBusiness>;
}> {
  const offers = await listAllActiveOffers();

  // Recupera le attivita coinvolte e filtra quelle non approvate.
  const businessIds = Array.from(new Set(offers.map((o) => String(o.businessId))));
  const businessesById = new Map<string, IBusiness>();
  await Promise.all(
    businessIds.map(async (id) => {
      const business = await findBusinessById(id);
      if (business && business.approvalStatus === BusinessApprovalStatus.APPROVED) {
        businessesById.set(id, business);
      }
    }),
  );

  const visibleOffers = offers.filter((o) => businessesById.has(String(o.businessId)));
  return { offers: visibleOffers, businessesById };
}
