import { Schema, model, Document, Model, Types } from 'mongoose';
import { OfferStatus } from '@trentino-quest/shared-types';

export { OfferStatus };

/**
 * Offerta pubblicata da un'Attivita Locale (RF29 del Deliverable D1).
 *
 * Ogni offerta appartiene a una singola attivita (businessId) e ha un
 * costo in punti (pointsCost) che il giocatore spendera' per riscattarla.
 * Il flusso di riscatto e' previsto come sviluppo futuro: il modello
 * espone gia' il costo per predisporlo.
 *
 * Adotta il soft-delete (status archived) coerente con quest e
 * collezionabili: un'offerta archiviata non e' piu' visibile ma resta
 * a fini storici.
 */
export interface IOffer extends Document {
  businessId: Types.ObjectId;
  title: string;
  description: string;
  pointsCost: number;
  status: OfferStatus;
  remaining: number | null;
  createdAt: Date;
  updatedAt: Date;
}

const offerSchema = new Schema<IOffer>(
  {
    businessId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: [true, 'Titolo obbligatorio'],
      trim: true,
      minlength: [3, 'Il titolo deve contenere almeno 3 caratteri'],
      maxlength: [100, "Il titolo non puo' superare 100 caratteri"],
    },
    description: {
      type: String,
      required: [true, 'Descrizione obbligatoria'],
      trim: true,
      maxlength: [500, "La descrizione non puo' superare 500 caratteri"],
    },
    pointsCost: {
      type: Number,
      required: true,
      min: [1, 'Il costo in punti deve essere almeno 1'],
    },
    status: {
      type: String,
      enum: Object.values(OfferStatus),
      default: OfferStatus.ACTIVE,
    },
    remaining: { type: Number, default: null, min: 0 },
  },
  {
    timestamps: true,
    collection: 'offers',
  },
);

export const Offer: Model<IOffer> = model<IOffer>('Offer', offerSchema);
