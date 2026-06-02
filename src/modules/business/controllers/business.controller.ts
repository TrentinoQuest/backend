import { Request, Response, NextFunction } from 'express';
import type {
  Business as BusinessDTO,
  Offer as OfferDTO,
  OfferWithBusiness,
  ListBusinessesResponse,
} from '@trentino-quest/shared-types';
import { IBusiness } from '../../../database/models/User.model';
import { IOffer } from '../../../database/models/Offer.model';
import {
  registerBusinessSchema,
  updateBusinessProfileSchema,
  createOfferSchema,
  updateOfferSchema,
  listBusinessesQuerySchema,
  rejectBusinessSchema,
  objectIdParamSchema,
} from '../validators/business.validators';
import {
  registerBusiness,
  getBusinessProfile,
  updateOwnBusinessProfile,
  listOwnOffers,
  createOwnOffer,
  updateOwnOffer,
  archiveOwnOffer,
  listBusinessesForAdmin,
  approveBusiness,
  rejectBusiness,
  listOffersForPlayers,
} from '../services/business.service';
import { UnauthorizedError } from '../../../utils/errors';

/**
 * Estrae l'id dell'utente autenticato dalla request.
 * Gli handler che usano questo helper sono sempre protetti da
 * authenticate + requireRole, quindi req.user e' garantito presente;
 * il controllo esplicito serve solo a soddisfare il narrowing di TypeScript.
 */
function requireUserId(req: Request): string {
  if (!req.user) {
    throw new UnauthorizedError('Utente non autenticato', 'NOT_AUTHENTICATED');
  }
  return String(req.user._id);
}

/**
 * Serializza il profilo di un'attivita per la response HTTP.
 */
function serializeBusiness(business: IBusiness): BusinessDTO {
  return {
    id: String(business._id),
    email: business.email,
    role: 'business',
    businessName: business.businessName,
    businessType: business.businessType,
    address: business.address,
    position: {
      lat: business.position.coordinates[1],
      lng: business.position.coordinates[0],
    },
    approvalStatus: business.approvalStatus,
    createdAt: business.createdAt.toISOString(),
  };
}

/**
 * Serializza un'offerta per la response HTTP.
 */
function serializeOffer(offer: IOffer): OfferDTO {
  return {
    id: String(offer._id),
    businessId: String(offer.businessId),
    title: offer.title,
    description: offer.description,
    pointsCost: offer.pointsCost,
    status: offer.status,
    createdAt: offer.createdAt.toISOString(),
  };
}

/* ----------------------------- Registrazione ---------------------------- */

/**
 * Handler per POST /business/register.
 */
export async function registerBusinessHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const body = registerBusinessSchema.parse(req.body);
    const userAgent = req.get('user-agent');
    const result = await registerBusiness(body, userAgent);
    res.status(201).json({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      accessExpiresIn: result.accessExpiresIn,
      refreshExpiresIn: result.refreshExpiresIn,
      user: serializeBusiness(result.user as IBusiness),
    });
  } catch (err) {
    next(err);
  }
}

/* ------------------------------ Profilo own ----------------------------- */

/**
 * Handler per GET /business/me.
 */
export async function getOwnBusinessHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const businessId = requireUserId(req);
    const business = await getBusinessProfile(businessId);
    res.status(200).json(serializeBusiness(business));
  } catch (err) {
    next(err);
  }
}

/**
 * Handler per PATCH /business/me.
 */
export async function updateOwnBusinessHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const businessId = requireUserId(req);
    const body = updateBusinessProfileSchema.parse(req.body);
    const data: Record<string, unknown> = { ...body };
    if (body.position) {
      data.position = {
        type: 'Point',
        coordinates: [body.position.lng, body.position.lat],
      };
    }
    const business = await updateOwnBusinessProfile(businessId, data);
    res.status(200).json(serializeBusiness(business));
  } catch (err) {
    next(err);
  }
}

/* ------------------------------ Offerte own ----------------------------- */

/**
 * Handler per GET /business/offers.
 */
export async function listOwnOffersHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const businessId = requireUserId(req);
    const offers = await listOwnOffers(businessId);
    res.status(200).json(offers.map(serializeOffer));
  } catch (err) {
    next(err);
  }
}

/**
 * Handler per POST /business/offers.
 */
export async function createOwnOfferHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const businessId = requireUserId(req);
    const body = createOfferSchema.parse(req.body);
    const offer = await createOwnOffer(businessId, body);
    res.status(201).json(serializeOffer(offer));
  } catch (err) {
    next(err);
  }
}

/**
 * Handler per PATCH /business/offers/:id.
 */
export async function updateOwnOfferHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const businessId = requireUserId(req);
    const params = objectIdParamSchema.parse(req.params);
    const body = updateOfferSchema.parse(req.body);
    const offer = await updateOwnOffer(businessId, params.id, body);
    res.status(200).json(serializeOffer(offer));
  } catch (err) {
    next(err);
  }
}

/**
 * Handler per DELETE /business/offers/:id (soft-delete).
 */
export async function archiveOwnOfferHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const businessId = requireUserId(req);
    const params = objectIdParamSchema.parse(req.params);
    await archiveOwnOffer(businessId, params.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

/* ------------------------------ Admin side ------------------------------ */

/**
 * Handler per GET /admin/businesses.
 */
export async function listBusinessesHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const query = listBusinessesQuerySchema.parse(req.query);
    const result = await listBusinessesForAdmin(query);
    const response: ListBusinessesResponse = {
      data: result.data.map(serializeBusiness),
      total: result.total,
      limit: result.limit,
      offset: result.offset,
    };
    res.status(200).json(response);
  } catch (err) {
    next(err);
  }
}

/**
 * Handler per POST /admin/businesses/:id/approve.
 */
export async function approveBusinessHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const params = objectIdParamSchema.parse(req.params);
    const business = await approveBusiness(params.id);
    res.status(200).json(serializeBusiness(business));
  } catch (err) {
    next(err);
  }
}

/**
 * Handler per POST /admin/businesses/:id/reject.
 */
export async function rejectBusinessHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const params = objectIdParamSchema.parse(req.params);
    const body = rejectBusinessSchema.parse(req.body);
    const business = await rejectBusiness(params.id, body.reason);
    res.status(200).json(serializeBusiness(business));
  } catch (err) {
    next(err);
  }
}

/* ----------------------------- Player side ------------------------------ */

/**
 * Handler per GET /offers.
 * Lista le offerte attive delle attivita approvate, arricchite con i dati
 * dell'attivita di appartenenza.
 */
export async function listPublicOffersHandler(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { offers, businessesById } = await listOffersForPlayers();
    const enriched: OfferWithBusiness[] = offers.map((offer) => {
      const business = businessesById.get(String(offer.businessId));
      return {
        ...serializeOffer(offer),
        businessName: business ? business.businessName : '',
        businessType: business ? business.businessType : 'other',
        businessAddress: business ? business.address : '',
        businessPosition: business
          ? {
              lat: business.position.coordinates[1],
              lng: business.position.coordinates[0],
            }
          : { lat: 0, lng: 0 },
      } as OfferWithBusiness;
    });
    res.status(200).json(enriched);
  } catch (err) {
    next(err);
  }
}
