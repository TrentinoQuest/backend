import { Schema, model, Document, Model, Types } from 'mongoose';

export enum DailyQuestType {
  WALK_2KM = 'walk_2km',
  FIND_SECONDARY = 'find_secondary',
  REACH_ALTITUDE = 'reach_altitude',
  LORE_QUIZ = 'lore_quiz',
  FLIP_COLLECTIBLES = 'flip_collectibles',
  SEND_KUDOS = 'send_kudos',
}

export enum DailyQuestContext {
  IN_TRENTINO = 'in_trentino',
  OUT_OF_REGION = 'out_of_region',
  ANY = 'any',
}

export interface IDailyQuestDefinition {
  type: DailyQuestType;
  title: string;
  description: string;
  context: DailyQuestContext;
  xpReward: number;
  coinsReward: number;
}

export interface IDailyQuestItem {
  type: DailyQuestType;
  title: string;
  description: string;
  xpReward: number;
  coinsReward: number;
  completed: boolean;
  completedAt: Date | null;
}

export interface IDailyQuestAssignment extends Document {
  playerId: Types.ObjectId;
  date: string;
  quests: IDailyQuestItem[];
  createdAt: Date;
}

const dailyQuestAssignmentSchema = new Schema<IDailyQuestAssignment>(
  {
    playerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    date: { type: String, required: true },
    quests: [
      {
        type: { type: String, enum: Object.values(DailyQuestType), required: true },
        title: { type: String, required: true },
        description: { type: String, required: true },
        xpReward: { type: Number, required: true },
        coinsReward: { type: Number, required: true },
        completed: { type: Boolean, default: false },
        completedAt: { type: Date, default: null },
      },
    ],
  },
  { timestamps: true, collection: 'daily_quest_assignments' },
);

dailyQuestAssignmentSchema.index({ playerId: 1, date: 1 }, { unique: true });

export const DailyQuestAssignment: Model<IDailyQuestAssignment> = model<IDailyQuestAssignment>(
  'DailyQuestAssignment',
  dailyQuestAssignmentSchema,
);
