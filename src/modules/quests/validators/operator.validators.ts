import { z } from 'zod';
import { PlacementStatus } from '@trentino-quest/shared-types';

/**
 * Validator zod per un punto GeoJSON espresso in formato { lat, lng }.
 */
const geoPointSchema = z
  .object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
  })
  .strict();

/**
 * Validator zod per i metadati di qualita' di un fix GPS.
 *
 * Coerente con il campo `fix` di CheckInRequest e ScanQrRequest
 * introdotto nella feature anti-cheat: accuracy in metri e timestamp
 * client in millisecondi epoch.
 */
const geoFixSchema = z
  .object({
    accuracy: z.number().min(0),
    clientTimestamp: z.number().int().positive(),
  })
  .strict();

/**
 * Validator zod per il path parameter contenente un ObjectId di MongoDB.
 */
export const objectIdParamSchema = z
  .object({
    id: z.string().regex(/^[a-f0-9]{24}$/i, 'Identificativo non valido'),
  })
  .strict();

export type ObjectIdParam = z.infer<typeof objectIdParamSchema>;

/**
 * Validator per il piazzamento di un QR code (RF40).
 */
export const placeQuestSchema = z
  .object({
    exactPosition: geoPointSchema,
    fix: geoFixSchema.optional(),
  })
  .strict();

export type PlaceQuestInput = z.infer<typeof placeQuestSchema>;

/**
 * Validator per l'aggiornamento della posizione di un QR (RF41).
 */
export const updatePositionSchema = z
  .object({
    exactPosition: geoPointSchema,
    fix: geoFixSchema.optional(),
  })
  .strict();

export type UpdatePositionInput = z.infer<typeof updatePositionSchema>;

/**
 * Validator per la segnalazione di un QR mancante o danneggiato (RF44).
 */
export const reportIssueSchema = z
  .object({
    note: z.string().trim().max(500).optional(),
  })
  .strict();

export type ReportIssueInput = z.infer<typeof reportIssueSchema>;

/**
 * Validator per i query parameter della lista operatore.
 */
export const listOperatorQuestsQuerySchema = z
  .object({
    placementStatus: z.nativeEnum(PlacementStatus).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    offset: z.coerce.number().int().min(0).default(0),
  })
  .strict();

export type ListOperatorQuestsQuery = z.infer<typeof listOperatorQuestsQuerySchema>;
