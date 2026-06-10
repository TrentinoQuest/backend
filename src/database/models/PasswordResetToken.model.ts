import { Schema, model, Document, Model, Types } from 'mongoose';

/**
 * Token di reset password emesso dal flusso di recovery.
 *
 * Come per i refresh token, il valore in chiaro non viene mai
 * memorizzato: sul DB salviamo solo l'hash SHA-256. Il token e'
 * monouso (usedAt) e ha una scadenza breve.
 */
export interface IPasswordResetToken extends Document {
  userId: Types.ObjectId;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
}

const passwordResetTokenSchema = new Schema<IPasswordResetToken>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: 'password_reset_tokens' },
);

// TTL: MongoDB elimina automaticamente i token scaduti.
passwordResetTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const PasswordResetToken: Model<IPasswordResetToken> = model<IPasswordResetToken>(
  'PasswordResetToken',
  passwordResetTokenSchema,
);
