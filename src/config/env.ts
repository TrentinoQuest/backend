import 'dotenv/config';
import { z } from 'zod';

/**
 * Schema di validazione delle variabili d'ambiente.
 * La validazione viene eseguita all'avvio dell'applicazione: se una variabile
 * è mancante o non valida, il processo termina immediatamente con un errore
 * descrittivo, evitando comportamenti inattesi a runtime.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  MONGODB_URI: z.string().url(),
  DB_RETRY_INTERVAL_MS: z.coerce.number().int().positive().default(5000),

  JWT_SECRET: z.string().optional(),
  JWT_EXPIRES_IN: z.string().default('7d'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Variabili d'ambiente non valide:", parsed.error.format());
  process.exit(1);
}

export const env = parsed.data;
