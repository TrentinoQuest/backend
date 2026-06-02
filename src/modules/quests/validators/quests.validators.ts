import { z } from 'zod';
import { QuestType } from '@trentino-quest/shared-types';

/**
 * Validator zod per un punto GeoJSON espresso in formato { lat, lng }.
 *
 * Le coordinate vengono validate sui range geografici globali. Il range
 * effettivo del Trentino (lat 45.6-46.9, lng 10.4-12.0) non e' applicato
 * a livello di validator per non bloccare eventuali test al di fuori
 * dell'area, ma il service applica regole geografiche piu' stringenti
 * quando rilevante.
 */
const geoPointSchema = z
  .object({
    lat: z.number().min(-90, 'Latitudine fuori range').max(90, 'Latitudine fuori range'),
    lng: z.number().min(-180, 'Longitudine fuori range').max(180, 'Longitudine fuori range'),
  })
  .strict();

/**
 * Validator zod per i metadati di qualita' di un fix GPS, allegati
 * opzionalmente ai payload di check-in e scansione QR (shared-types
 * v0.5.0+).
 *
 * Applica solo controlli di sanita' strutturale sui campi:
 *  - accuracy: numero positivo, upper bound 100km come limite di
 *    plausibilita' (oltre sarebbe certamente un bug del client).
 *  - clientTimestamp: intero positivo in ms epoch.
 *
 * I controlli di business (rifiuto fix imprecisi o vecchi rispetto
 * alle soglie configurate via env) sono in validateGeoFix dentro
 * src/modules/quests/utils/geo.utils.ts.
 */
const geoFixSchema = z
  .object({
    accuracy: z
      .number()
      .positive("L'accuracy deve essere positiva")
      .max(100000, "L'accuracy oltre 100km non e' plausibile"),
    clientTimestamp: z
      .number()
      .int('clientTimestamp deve essere un intero')
      .positive('clientTimestamp deve essere positivo'),
  })
  .strict();

/**
 * Validator zod per i path parameter contenenti un ObjectId di MongoDB.
 *
 * Verifica solo la forma (24 caratteri hex), non l'esistenza nel database:
 * un ID malformato fallisce qui con 400, un ID ben formato ma inesistente
 * fallisce nel repository con 404.
 */
export const objectIdParamSchema = z
  .object({
    id: z.string().regex(/^[a-f0-9]{24}$/i, 'Identificativo non valido'),
  })
  .strict();

export type ObjectIdParam = z.infer<typeof objectIdParamSchema>;

/**
 * Validator zod per i query parameter di GET /quests.
 *
 * Tutti i parametri sono opzionali, ma se forniti devono rispettare i
 * vincoli (lat/lng coerenti tra loro, raggio in range sensato). Un
 * refinement finale verifica che lat+lng siano entrambi presenti o
 * entrambi assenti, perche' una sola coordinata e' priva di significato.
 *
 * I valori sono coerced perche' i query string sono sempre stringhe e
 * vanno convertiti a numero/enum prima della validazione.
 */
export const listQuestsQuerySchema = z
  .object({
    lat: z.coerce.number().min(-90).max(90).optional(),
    lng: z.coerce.number().min(-180).max(180).optional(),
    radiusMeters: z.coerce
      .number()
      .int()
      .min(100, "Il raggio minimo e' 100 metri")
      .max(50000, "Il raggio massimo e' 50000 metri")
      .optional(),
    type: z.nativeEnum(QuestType).optional(),
  })
  .strict()
  .refine(
    (data) => {
      const hasLat = data.lat !== undefined;
      const hasLng = data.lng !== undefined;
      return hasLat === hasLng;
    },
    {
      message: 'lat e lng devono essere forniti insieme',
      path: ['lat'],
    },
  );

export type ListQuestsQuery = z.infer<typeof listQuestsQuerySchema>;

/**
 * Validator zod per il payload di POST /quests/:id/check-in.
 *
 * Il giocatore invia la propria posizione GPS corrente per il check-in.
 * Il service verifica che rientri nel raggio della quest secondaria.
 *
 * Il campo `fix` e' opzionale: se presente, il service applica la
 * validazione anti-cheat (rifiuta fix troppo imprecisi o vecchi).
 */
export const checkInSchema = z
  .object({
    position: geoPointSchema,
    fix: geoFixSchema.optional(),
  })
  .strict();

export type CheckInInput = z.infer<typeof checkInSchema>;

/**
 * Validator zod per il payload di POST /quests/:id/scan.
 *
 * Riceve il token estratto dal QR code scansionato e la posizione GPS
 * del giocatore. Il token e' una stringa opaque la cui validita' viene
 * verificata dal service contro il valore registrato per la quest.
 *
 * Il campo `fix` e' opzionale: se presente, il service applica la
 * validazione anti-cheat (rifiuta fix troppo imprecisi o vecchi).
 */
export const scanQrSchema = z
  .object({
    qrToken: z.string().min(1, 'Token QR obbligatorio').max(500, 'Token QR troppo lungo'),
    position: geoPointSchema,
    fix: geoFixSchema.optional(),
  })
  .strict();

export type ScanQrInput = z.infer<typeof scanQrSchema>;

/**
 * Validator zod per i query parameter di GET /player/completions.
 *
 * Implementa la paginazione offset/limit con i default coerenti con lo
 * schema OpenAPI.
 */
export const listCompletionsQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(20),
    offset: z.coerce.number().int().min(0).default(0),
  })
  .strict();

export type ListCompletionsQuery = z.infer<typeof listCompletionsQuerySchema>;

/**
 * Validator zod per i query parameter di GET /player/progress.
 *
 * Lo zone identifier e' opzionale: se omesso, il service restituisce il
 * progresso aggregato sull'intero territorio.
 */
export const progressQuerySchema = z
  .object({
    zone: z.string().trim().min(1).max(100).optional(),
  })
  .strict();

export type ProgressQuery = z.infer<typeof progressQuerySchema>;
