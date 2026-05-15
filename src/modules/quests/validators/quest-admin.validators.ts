import { z } from 'zod';
import { QuestType, QuestStatus } from '@trentino-quest/shared-types';

/**
 * Validator zod per un punto GeoJSON espresso in formato { lat, lng }.
 * Stessa definizione del file quests.validators.ts ma duplicata qui per
 * non creare dipendenze inter-validator.
 */
const geoPointSchema = z
  .object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
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
 * Validator condiviso per i campi base presenti sia nel create primary
 * che nel create secondary.
 */
const baseQuestFields = {
  name: z.string().trim().min(3).max(100),
  description: z.string().trim().min(1).max(1000),
  basePoints: z.number().int().min(0),
};

/**
 * Validator zod per la creazione di una quest secondaria via admin.
 */
export const createSecondaryQuestSchema = z
  .object({
    type: z.literal(QuestType.SECONDARY),
    ...baseQuestFields,
    position: geoPointSchema,
    checkInRadiusMeters: z.number().int().min(5).max(500),
  })
  .strict();

export type CreateSecondaryQuestInput = z.infer<typeof createSecondaryQuestSchema>;

/**
 * Validator zod per la creazione di una quest principale via admin.
 *
 * Non include exactPosition, qrToken, validationRadiusMeters: l'admin
 * imposta solo l'area di ricerca; il piazzamento esatto e' a carico
 * dell'operatore.
 */
export const createPrimaryQuestSchema = z
  .object({
    type: z.literal(QuestType.PRIMARY),
    ...baseQuestFields,
    searchArea: geoPointSchema,
    searchRadiusMeters: z.number().int().min(10).max(10000),
    collectibleId: z
      .string()
      .regex(/^[a-f0-9]{24}$/i)
      .nullable()
      .optional(),
  })
  .strict();

export type CreatePrimaryQuestInput = z.infer<typeof createPrimaryQuestSchema>;

/**
 * Validator zod discriminato per la creazione di una quest.
 *
 * In base al campo type, zod sceglie automaticamente lo schema corretto
 * (primary o secondary) e applica le rispettive regole. Restituisce un
 * errore se il tipo non e' valido o se mancano i campi richiesti.
 */
export const createQuestSchema = z.discriminatedUnion('type', [
  createSecondaryQuestSchema,
  createPrimaryQuestSchema,
]);

export type CreateQuestInput = z.infer<typeof createQuestSchema>;

/**
 * Validator zod per l'aggiornamento di una quest esistente.
 *
 * Tutti i campi sono opzionali. Il service verifica che i campi
 * specifici di un tipo (es. searchArea per primary) siano applicati
 * solo a quest del tipo corretto.
 */
export const updateQuestSchema = z
  .object({
    name: z.string().trim().min(3).max(100).optional(),
    description: z.string().trim().min(1).max(1000).optional(),
    basePoints: z.number().int().min(0).optional(),
    searchArea: geoPointSchema.optional(),
    searchRadiusMeters: z.number().int().min(10).max(10000).optional(),
    collectibleId: z
      .string()
      .regex(/^[a-f0-9]{24}$/i)
      .nullable()
      .optional(),
    position: geoPointSchema.optional(),
    checkInRadiusMeters: z.number().int().min(5).max(500).optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Almeno un campo deve essere fornito',
  });

export type UpdateQuestInput = z.infer<typeof updateQuestSchema>;

/**
 * Validator zod per i query parameter di GET /admin/quests.
 */
export const listAdminQuestsQuerySchema = z
  .object({
    type: z.nativeEnum(QuestType).optional(),
    status: z.nativeEnum(QuestStatus).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    offset: z.coerce.number().int().min(0).default(0),
  })
  .strict();

export type ListAdminQuestsQuery = z.infer<typeof listAdminQuestsQuerySchema>;
