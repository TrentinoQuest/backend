import { Schema, model, Document, Model, Types } from 'mongoose';

export type FriendshipStatus = 'pending' | 'accepted' | 'rejected';

export interface IFriendship extends Document {
  requesterId: Types.ObjectId;
  recipientId: Types.ObjectId;
  status: FriendshipStatus;
  lastNudgeAt: Date | null;
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
  },
  { timestamps: true, collection: 'friendships' },
);

friendshipSchema.index({ requesterId: 1, recipientId: 1 }, { unique: true });
friendshipSchema.index({ recipientId: 1, status: 1 });

export const Friendship: Model<IFriendship> = model<IFriendship>('Friendship', friendshipSchema);
