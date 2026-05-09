import { Schema, model, Document, Model, Types } from 'mongoose';

/**
 * Documento Mongoose che rappresenta un refresh token emesso e valido.
 *
 * Il valore in chiaro del refresh token NON viene mai memorizzato:
 * sul DB salviamo solo il suo hash SHA-256. Quando il client invia un
 * refresh token al backend, calcoliamo l'hash della stringa ricevuta e
 * cerchiamo nel DB. Questo limita il danno in caso di compromissione
 * della collection: l'attaccante non puo' usare i token direttamente.
 *
 * Il campo revokedAt viene popolato in due scenari:
 * - logout esplicito dell'utente (POST /auth/logout)
 * - rotation: ogni chiamata a /auth/refresh emette un nuovo token e
 *   revoca quello precedente
 *
 * I documenti scaduti o revocati da molto tempo vengono rimossi dal
 * cleanup job periodico (vedi src/jobs/refresh-token-cleanup.ts).
 */
export interface IRefreshToken extends Document {
  userId: Types.ObjectId;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  userAgent: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const refreshTokenSchema = new Schema<IRefreshToken>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    tokenHash: {
      type: String,
      required: true,
      unique: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
    revokedAt: {
      type: Date,
      default: null,
    },
    userAgent: {
      type: String,
      default: null,
      maxlength: 500,
    },
  },
  {
    timestamps: true,
    collection: 'refresh_tokens',
  },
);

/**
 * Indice TTL su expiresAt: MongoDB rimuove automaticamente i documenti
 * dopo che expiresAt e' nel passato. Riduce la necessita' del cleanup
 * job esplicito per i token scaduti naturalmente. I token revocati ma
 * non scaduti vengono comunque gestiti dal cleanup job applicativo,
 * cosi' da poterne mantenere il log per un periodo di audit.
 */
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

/**
 * Indice composto su userId + revokedAt utile per query del tipo
 * "elenca tutti i refresh token attivi di un utente", funzionalita'
 * pianificata per la gestione device del backoffice.
 */
refreshTokenSchema.index({ userId: 1, revokedAt: 1 });

export const RefreshToken: Model<IRefreshToken> = model<IRefreshToken>(
  'RefreshToken',
  refreshTokenSchema,
);
