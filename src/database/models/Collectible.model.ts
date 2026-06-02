import { Schema, model, Document, Model } from 'mongoose';

/**
 * Rarita' del collezionabile, mostrata al giocatore come indicatore di
 * difficolta'/prestigio. Mappa la classe Collezionabile del Deliverable D2.
 */
export enum CollectibleRarity {
  COMMON = 'common',
  UNCOMMON = 'uncommon',
  RARE = 'rare',
  LEGENDARY = 'legendary',
}

/**
 * Stato del ciclo di vita del collezionabile. Coerente con il soft-delete
 * delle quest: un collezionabile archiviato non e' piu' assegnabile a nuove
 * quest ma resta negli album dei giocatori che lo hanno gia' sbloccato.
 */
export enum CollectibleStatus {
  ACTIVE = 'active',
  ARCHIVED = 'archived',
}

/**
 * Interfaccia del collezionabile.
 *
 * Un collezionabile e' un oggetto digitale unico che il giocatore sblocca
 * completando una quest principale. Ogni quest principale e' associata a
 * un collezionabile (vedi Quest.collectibleId), che viene aggiunto
 * all'album personale del giocatore al momento del completamento.
 */
export interface ICollectible extends Document {
  name: string;
  description: string;
  imageUrl: string;
  rarity: CollectibleRarity;
  createdAt: Date;
  updatedAt: Date;
  status: CollectibleStatus;
}

const collectibleSchema = new Schema<ICollectible>(
  {
    name: {
      type: String,
      required: [true, 'Nome obbligatorio'],
      trim: true,
      minlength: [3, 'Il nome deve contenere almeno 3 caratteri'],
      maxlength: [100, "Il nome non puo' superare 100 caratteri"],
    },
    description: {
      type: String,
      required: [true, 'Descrizione obbligatoria'],
      trim: true,
      maxlength: [500, "La descrizione non puo' superare 500 caratteri"],
    },
    imageUrl: {
      type: String,
      required: [true, 'URL immagine obbligatorio'],
      trim: true,
    },
    rarity: {
      type: String,
      enum: Object.values(CollectibleRarity),
      required: true,
      default: CollectibleRarity.COMMON,
    },
    status: {
      type: String,
      enum: Object.values(CollectibleStatus),
      default: CollectibleStatus.ACTIVE,
    },
  },
  {
    timestamps: true,
    collection: 'collectibles',
  },
);

export const Collectible: Model<ICollectible> = model<ICollectible>(
  'Collectible',
  collectibleSchema,
);
