import { Schema, model, Document, Model, Types } from 'mongoose';

export enum CoopChallengeType {
  WALK_50KM = 'walk_50km',
  COMPLETE_10 = 'complete_10_quests',
  UNLOCK_5_RARE = 'unlock_5_rare',
}

const COOP_CHALLENGE_META: Record<
  CoopChallengeType,
  { title: string; description: string; targetValue: number }
> = {
  [CoopChallengeType.WALK_50KM]: {
    title: 'Camminatori delle Dolomiti',
    description: 'Percorrete insieme 50 km sul territorio trentino.',
    targetValue: 50,
  },
  [CoopChallengeType.COMPLETE_10]: {
    title: 'Esploratori in Coppia',
    description: 'Completate insieme 10 quest secondarie.',
    targetValue: 10,
  },
  [CoopChallengeType.UNLOCK_5_RARE]: {
    title: 'Cacciatori di Rarità',
    description: 'Sbloccate insieme 5 collezionabili rari o leggendari.',
    targetValue: 5,
  },
};

export { COOP_CHALLENGE_META };

export interface ICoopChallenge extends Document {
  initiatorId: Types.ObjectId;
  partnerId: Types.ObjectId;
  type: CoopChallengeType;
  title: string;
  description: string;
  targetValue: number;
  initiatorProgress: number;
  partnerProgress: number;
  status: 'active' | 'completed' | 'expired';
  startedAt: Date;
  expiresAt: Date;
  rewardCollectibleId: Types.ObjectId | null;
}

const coopChallengeSchema = new Schema<ICoopChallenge>(
  {
    initiatorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    partnerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: Object.values(CoopChallengeType), required: true },
    title: { type: String, required: true },
    description: { type: String, required: true },
    targetValue: { type: Number, required: true },
    initiatorProgress: { type: Number, default: 0 },
    partnerProgress: { type: Number, default: 0 },
    status: { type: String, enum: ['active', 'completed', 'expired'], default: 'active' },
    startedAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
    rewardCollectibleId: { type: Schema.Types.ObjectId, ref: 'Collectible', default: null },
  },
  { collection: 'coop_challenges' },
);

coopChallengeSchema.index({ initiatorId: 1, status: 1 });
coopChallengeSchema.index({ partnerId: 1, status: 1 });

export const CoopChallenge: Model<ICoopChallenge> = model<ICoopChallenge>(
  'CoopChallenge',
  coopChallengeSchema,
);
