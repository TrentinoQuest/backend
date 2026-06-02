import { z } from 'zod';
import { BusinessType, BusinessApprovalStatus } from '@trentino-quest/shared-types';

/**
 * Validator per un punto geografico { lat, lng }.
 */
const geoPointSchema = z
  .object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
  })
  .strict();

/**
 * Validator per il path parameter con ObjectId di MongoDB.
 */
export const objectIdParamSchema = z
  .object({
    id: z.string().regex(/^[a-f0-9]{24}$/i, 'Identificativo non valido'),
  })
  .strict();

/**
 * Validator per la registrazione di un'Attivita Locale (RF28).
 */
export const registerBusinessSchema = z
  .object({
    email: z.string().trim().email('Email non valida'),
    password: z.string().min(8, 'La password deve contenere almeno 8 caratteri'),
    businessName: z.string().trim().min(2).max(120),
    businessType: z.nativeEnum(BusinessType),
    address: z.string().trim().min(1).max(200),
    position: geoPointSchema,
  })
  .strict();

export type RegisterBusinessInput = z.infer<typeof registerBusinessSchema>;

/**
 * Validator per l'aggiornamento del profilo aziendale.
 */
export const updateBusinessProfileSchema = z
  .object({
    businessName: z.string().trim().min(2).max(120).optional(),
    businessType: z.nativeEnum(BusinessType).optional(),
    address: z.string().trim().min(1).max(200).optional(),
    position: geoPointSchema.optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Almeno un campo deve essere fornito',
  });

export type UpdateBusinessProfileInput = z.infer<typeof updateBusinessProfileSchema>;

/**
 * Validator per la creazione di un'offerta (RF29).
 */
export const createOfferSchema = z
  .object({
    title: z.string().trim().min(3).max(100),
    description: z.string().trim().min(1).max(500),
    pointsCost: z.number().int().min(1, 'Il costo in punti deve essere almeno 1'),
  })
  .strict();

export type CreateOfferInput = z.infer<typeof createOfferSchema>;

/**
 * Validator per l'aggiornamento di un'offerta.
 */
export const updateOfferSchema = z
  .object({
    title: z.string().trim().min(3).max(100).optional(),
    description: z.string().trim().min(1).max(500).optional(),
    pointsCost: z.number().int().min(1).optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Almeno un campo deve essere fornito',
  });

export type UpdateOfferInput = z.infer<typeof updateOfferSchema>;

/**
 * Validator per i query parameter della lista affiliazioni lato admin.
 */
export const listBusinessesQuerySchema = z
  .object({
    approvalStatus: z.nativeEnum(BusinessApprovalStatus).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    offset: z.coerce.number().int().min(0).default(0),
  })
  .strict();

export type ListBusinessesQueryInput = z.infer<typeof listBusinessesQuerySchema>;

/**
 * Validator per il rifiuto di un'affiliazione, con motivazione opzionale.
 */
export const rejectBusinessSchema = z
  .object({
    reason: z.string().trim().max(500).optional(),
  })
  .strict();

export type RejectBusinessInput = z.infer<typeof rejectBusinessSchema>;
