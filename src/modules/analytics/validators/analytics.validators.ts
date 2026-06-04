import { z } from 'zod';
import { AnalyticsGranularity } from '@trentino-quest/shared-types';

/**
 * Validator per il range temporale e la granularita' degli endpoint
 * completions-over-time.
 *
 * I parametri sono tutti opzionali: il service applica i default
 * (ultimi 30 giorni, granularita' day) quando non specificati.
 */
export const completionsOverTimeQuerySchema = z
  .object({
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    granularity: z.nativeEnum(AnalyticsGranularity).optional(),
  })
  .strict()
  .refine((data) => !data.from || !data.to || data.from <= data.to, {
    message: '"from" deve essere precedente o uguale a "to"',
  });

export type CompletionsOverTimeQueryInput = z.infer<typeof completionsOverTimeQuerySchema>;

/**
 * Validator per il range temporale degli endpoint heatmap.
 */
export const heatmapQuerySchema = z
  .object({
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
  })
  .strict()
  .refine((data) => !data.from || !data.to || data.from <= data.to, {
    message: '"from" deve essere precedente o uguale a "to"',
  });

export type HeatmapQueryInput = z.infer<typeof heatmapQuerySchema>;

/**
 * Validator per il parametro limit degli endpoint top-quests e leaderboard.
 */
export const limitQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(10),
  })
  .strict();

export type LimitQueryInput = z.infer<typeof limitQuerySchema>;
