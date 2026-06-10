import { Schema, model, Document, Model, Types } from 'mongoose';

export type KudosEmoji = 'beer' | 'highfive' | 'star';

export interface IKudos extends Document {
  fromPlayerId: Types.ObjectId;
  toPlayerId: Types.ObjectId;
  activityType: string;
  activityId: string;
  emoji: KudosEmoji;
  createdAt: Date;
}

const kudosSchema = new Schema<IKudos>(
  {
    fromPlayerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    toPlayerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    activityType: { type: String, required: true },
    activityId: { type: String, required: true },
    emoji: { type: String, enum: ['beer', 'highfive', 'star'], required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { collection: 'kudos' },
);

kudosSchema.index({ fromPlayerId: 1, activityId: 1 }, { unique: true });
kudosSchema.index({ activityId: 1 });
kudosSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

export const Kudos: Model<IKudos> = model<IKudos>('Kudos', kudosSchema);
