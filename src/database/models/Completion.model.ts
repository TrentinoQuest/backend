import { Schema, model, Document, Model, Types } from 'mongoose';
import { GeoJsonPoint, geoJsonPointSchema } from './Quest.model';
/**
 * Interfaccia del completamento.
 *
 * Reifica la relazione N:M tra Giocatore e Quest del Deliverable D2:
 * ogni istanza rappresenta l'evento in cui un giocatore ha completato
 * con successo una specifica quest.
 *
 * Per vincolo applicativo esiste al piu' un Completion per ogni coppia
 * (playerId, questId): ogni quest puo' essere completata una sola volta
 * per utente. Questo invariante e' garantito dall'indice unique composto
 * sui due campi.
 *
 * pointsAwarded viene memorizzato sull'istanza (non ricalcolato a runtime
 * dai puntiBase della quest) per garantire l'invarianza storica anche se
 * il moltiplicatore zona cambia successivamente.
 *
 * position memorizza dove il giocatore si trovava al momento del
 * completamento, sia per audit sia per future analisi statistiche sui
 * flussi turistici (vedi modulo analytics).
 */
export interface ICompletion extends Document {
  playerId: Types.ObjectId;
  questId: Types.ObjectId;
  pointsAwarded: number;
  position: GeoJsonPoint;
  completedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const completionSchema = new Schema<ICompletion>(
  {
    playerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    questId: {
      type: Schema.Types.ObjectId,
      ref: 'Quest',
      required: true,
    },
    pointsAwarded: {
      type: Number,
      required: true,
      min: [0, 'I punti assegnati non possono essere negativi'],
    },
    position: {
      type: geoJsonPointSchema,
      required: true,
    },
    completedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    collection: 'completions',
  },
);

/**
 * Indice unique composto su playerId + questId.
 *
 * Garantisce a livello di database che ogni coppia giocatore-quest abbia
 * al massimo un completion, indipendentemente da race condition o bug
 * applicativi. Un secondo tentativo di insert produrra' un duplicate key
 * error che il service traduce in ConflictError applicativo.
 */
completionSchema.index({ playerId: 1, questId: 1 }, { unique: true });

/**
 * Indice secondario su playerId per query del tipo "tutti i completamenti
 * di un giocatore" (album, statistiche personali).
 */
completionSchema.index({ playerId: 1, completedAt: -1 });

/**
 * Indice geografico sulla posizione del completamento per analisi
 * statistiche sui flussi turistici.
 */
completionSchema.index({ position: '2dsphere' });

export const Completion: Model<ICompletion> = model<ICompletion>('Completion', completionSchema);
