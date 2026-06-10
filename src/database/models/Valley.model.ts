import { Schema, model, Document, Model } from 'mongoose';

type GeoPolygon = { type: 'Polygon'; coordinates: [number, number][][] };
type GeoMultiPolygon = { type: 'MultiPolygon'; coordinates: [number, number][][][] };

export interface IValley extends Document {
  name: string;
  polygon: GeoPolygon | GeoMultiPolygon;
}

const valleySchema = new Schema<IValley>(
  {
    name: { type: String, required: true, trim: true },
    polygon: {
      type: {
        type: String,
        enum: ['Polygon', 'MultiPolygon'],
        required: true,
      },
      coordinates: { type: Schema.Types.Mixed, required: true },
    },
  },
  { collection: 'valleys' },
);

valleySchema.index({ polygon: '2dsphere' });

export const Valley: Model<IValley> = model<IValley>('Valley', valleySchema);
