import { Schema, model, Document, Model, Types } from 'mongoose';

export interface ILoreQuestion extends Document {
  text: string;
  options: string[];
  correctOptionIndex: number;
  explanation: string;
  category: string;
  active: boolean;
}

export interface ILoreAnswer extends Document {
  playerId: Types.ObjectId;
  questionId: Types.ObjectId;
  date: string;
  selectedOption: number;
  correct: boolean;
  answeredAt: Date;
}

const loreQuestionSchema = new Schema<ILoreQuestion>(
  {
    text: { type: String, required: true, trim: true },
    options: { type: [String], required: true, validate: (v: string[]) => v.length === 4 },
    correctOptionIndex: { type: Number, required: true, min: 0, max: 3 },
    explanation: { type: String, required: true, trim: true },
    category: { type: String, required: true, trim: true },
    active: { type: Boolean, default: true },
  },
  { collection: 'lore_questions' },
);

const loreAnswerSchema = new Schema<ILoreAnswer>(
  {
    playerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    questionId: { type: Schema.Types.ObjectId, ref: 'LoreQuestion', required: true },
    date: { type: String, required: true },
    selectedOption: { type: Number, required: true, min: 0, max: 3 },
    correct: { type: Boolean, required: true },
    answeredAt: { type: Date, default: Date.now },
  },
  { collection: 'lore_answers' },
);

loreAnswerSchema.index({ playerId: 1, date: 1 }, { unique: true });

export const LoreQuestion: Model<ILoreQuestion> = model<ILoreQuestion>(
  'LoreQuestion',
  loreQuestionSchema,
);
export const LoreAnswer: Model<ILoreAnswer> = model<ILoreAnswer>('LoreAnswer', loreAnswerSchema);
