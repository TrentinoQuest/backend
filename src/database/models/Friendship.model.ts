import { Schema, model, Document, Model, Types } from 'mongoose';

export type FriendshipStatus = 'pending' | 'accepted' | 'rejected';

export interface IFriendship extends Document {
  requesterId: Types.ObjectId;
  recipientId: Types.ObjectId;
  status: FriendshipStatus;
  lastNudgeAt: Date | null;
  /**
   * Chiave normalizzata della coppia (id ordinati): garantisce a livello
   * di indice unique che non possano esistere due relazioni per la stessa
   * coppia, indipendentemente dalla direzione (A→B e B→A concorrenti).
   */
  pairKey: string;
  createdAt: Date;
  updatedAt: Date;
}

const friendshipSchema = new Schema<IFriendship>(
  {
    requesterId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    recipientId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'rejected'],
      default: 'pending',
    },
    lastNudgeAt: { type: Date, default: null },
    pairKey: { type: String },
  },
  { timestamps: true, collection: 'friendships' },
);

// Calcola la pairKey prima della validazione cosi' da non doverla mai
// passare manualmente alla create().
friendshipSchema.pre('validate', function computePairKey() {
  const ids = [String(this.requesterId), String(this.recipientId)].sort();
  this.pairKey = ids.join('_');
});

friendshipSchema.index({ pairKey: 1 }, { unique: true });
friendshipSchema.index({ requesterId: 1, recipientId: 1 });
friendshipSchema.index({ recipientId: 1, status: 1 });

export const Friendship: Model<IFriendship> = model<IFriendship>('Friendship', friendshipSchema);
