import { Schema, model, Document, Model, Types } from 'mongoose';

export enum LeagueTier {
  PORFIDO = 'porfido',
  MARMO = 'marmo',
  ARENARIA = 'arenaria',
  GRANITO = 'granito',
  DOLOMITI = 'dolomiti',
}

export const TIER_ORDER: LeagueTier[] = [
  LeagueTier.PORFIDO,
  LeagueTier.MARMO,
  LeagueTier.ARENARIA,
  LeagueTier.GRANITO,
  LeagueTier.DOLOMITI,
];

export interface ILeagueSeason extends Document {
  weekStart: Date;
  weekEnd: Date;
  active: boolean;
}

export interface ILeagueMembership extends Document {
  playerId: Types.ObjectId;
  seasonId: Types.ObjectId;
  groupId: string;
  tier: LeagueTier;
  weeklyXp: number;
  rank: number | null;
  promoted: boolean;
  relegated: boolean;
}

const leagueSeasonSchema = new Schema<ILeagueSeason>(
  {
    weekStart: { type: Date, required: true },
    weekEnd: { type: Date, required: true },
    active: { type: Boolean, default: true },
  },
  { collection: 'league_seasons' },
);

const leagueMembershipSchema = new Schema<ILeagueMembership>(
  {
    playerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    seasonId: { type: Schema.Types.ObjectId, ref: 'LeagueSeason', required: true },
    groupId: { type: String, required: true },
    tier: { type: String, enum: Object.values(LeagueTier), default: LeagueTier.PORFIDO },
    weeklyXp: { type: Number, default: 0 },
    rank: { type: Number, default: null },
    promoted: { type: Boolean, default: false },
    relegated: { type: Boolean, default: false },
  },
  { collection: 'league_memberships' },
);

leagueMembershipSchema.index({ playerId: 1, seasonId: 1 }, { unique: true });
leagueMembershipSchema.index({ seasonId: 1, groupId: 1 });

export const LeagueSeason: Model<ILeagueSeason> = model<ILeagueSeason>(
  'LeagueSeason',
  leagueSeasonSchema,
);
export const LeagueMembership: Model<ILeagueMembership> = model<ILeagueMembership>(
  'LeagueMembership',
  leagueMembershipSchema,
);
