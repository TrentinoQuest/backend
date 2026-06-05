import { Schema, model, Document, Model, Types } from 'mongoose';

export type CouponStatus = 'active' | 'redeemed' | 'expired';

export interface ICoupon extends Document {
  offerId: Types.ObjectId;
  playerId: Types.ObjectId;
  token: string;
  pointsCost: number;
  status: CouponStatus;
  purchasedAt: Date;
  expiresAt: Date;
  redeemedAt: Date | null;
}

const couponSchema = new Schema<ICoupon>(
  {
    offerId: { type: Schema.Types.ObjectId, ref: 'Offer', required: true },
    playerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    token: { type: String, required: true, unique: true },
    pointsCost: { type: Number, required: true },
    status: { type: String, enum: ['active', 'redeemed', 'expired'], default: 'active' },
    purchasedAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
    redeemedAt: { type: Date, default: null },
  },
  { collection: 'coupons' },
);

couponSchema.index({ playerId: 1, status: 1 });

export const Coupon: Model<ICoupon> = model<ICoupon>('Coupon', couponSchema);
