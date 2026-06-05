import { z } from 'zod';
import { CollectibleRarity } from '../../../database/models/Collectible.model';

/**
 * Validator per il path parameter contenente un ObjectId di MongoDB.
 */
export const collectibleIdParamSchema = z
  .object({
    id: z.string().regex(/^[a-f0-9]{24}$/i, 'Identificativo non valido'),
  })
  .strict();

/**
 * Validator per la creazione di un collezionabile.
 */
const coordinatesSchema = z
  .object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) })
  .nullable()
  .optional();

export const createCollectibleSchema = z
  .object({
    name: z.string().trim().min(3).max(100),
    description: z.string().trim().min(1).max(500),
    imageUrl: z.url('URL immagine non valido'),
    rarity: z.enum(CollectibleRarity),
    lore: z.string().trim().max(2000).nullable().optional(),
    audioGuideUrl: z.url('URL audio non valido').nullable().optional(),
    coordinates: coordinatesSchema,
  })
  .strict();

export type CreateCollectibleInput = z.infer<typeof createCollectibleSchema>;

/**
 * Validator per l'aggiornamento parziale di un collezionabile.
 * Almeno un campo deve essere fornito.
 */
export const updateCollectibleSchema = z
  .object({
    name: z.string().trim().min(3).max(100).optional(),
    description: z.string().trim().min(1).max(500).optional(),
    imageUrl: z.url('URL immagine non valido').optional(),
    rarity: z.enum(CollectibleRarity).optional(),
    lore: z.string().trim().max(2000).nullable().optional(),
    audioGuideUrl: z.url('URL audio non valido').nullable().optional(),
    coordinates: coordinatesSchema,
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Almeno un campo deve essere fornito',
  });

export type UpdateCollectibleInput = z.infer<typeof updateCollectibleSchema>;
