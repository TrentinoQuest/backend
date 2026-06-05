import { Schema, model, Document, Model } from 'mongoose';

export interface IValley extends Document {
  name: string;
  polygon: {
    type: 'Polygon';
    coordinates: [number, number][][];
  };
}

const valleySchema = new Schema<IValley>(
  {
    name: { type: String, required: true, trim: true },
    polygon: {
      type: {
        type: String,
        enum: ['Polygon'],
        required: true,
        default: 'Polygon',
      },
      coordinates: { type: [[[Number]]], required: true },
    },
  },
  { collection: 'valleys' },
);

valleySchema.index({ polygon: '2dsphere' });

export const Valley: Model<IValley> = model<IValley>('Valley', valleySchema);
