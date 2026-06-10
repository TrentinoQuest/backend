import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  MONGODB_URI: z.url(),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET deve essere lungo almeno 32 caratteri'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('30d'),

  DB_RETRY_INTERVAL_MS: z.coerce.number().int().positive().default(5000),

  GEO_MAX_ACCURACY_METERS: z.coerce.number().positive().max(10000).default(100),
  GEO_MAX_FIX_AGE_SECONDS: z.coerce.number().positive().max(3600).default(60),

  FIREBASE_ENABLED: z
    .string()
    .optional()
    .transform((v) => v === 'true')
    .default(false),
  FIREBASE_SERVICE_ACCOUNT_KEY_PATH: z.string().default('./firebase-service-account.json'),

  GOOGLE_CLIENT_ID: z.string().optional(),
  APPLE_CLIENT_ID: z.string().optional(),
  APPLE_TEAM_ID: z.string().optional(),
  APPLE_KEY_ID: z.string().optional(),
  APPLE_PRIVATE_KEY: z.string().optional(),

  SKIP_OAUTH_VERIFICATION: z
    .string()
    .optional()
    .transform((v) => v === 'true')
    .default(false),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Variabili d'ambiente non valide:", parsed.error.format());
  process.exit(1);
}

// SKIP_OAUTH_VERIFICATION accetta token OAuth senza verifica della firma:
// in produzione equivale a un bypass completo dell'autenticazione e non
// deve mai essere attivo. Fail-fast all'avvio.
if (parsed.data.NODE_ENV === 'production' && parsed.data.SKIP_OAUTH_VERIFICATION) {
  console.error('SKIP_OAUTH_VERIFICATION non può essere attivo in produzione');
  process.exit(1);
}

export const env = parsed.data;
