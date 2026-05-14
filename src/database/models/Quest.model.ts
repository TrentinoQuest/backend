import { Schema, model, Document, Model, Types } from 'mongoose';

/**
 * Tipi di quest supportati.
 * Mappa la distinzione del Deliverable D1 tra quest principali (con QR
 * code nascosto da scansionare) e quest secondarie (con check-in
 * geolocalizzato in una zona).
 */
export enum QuestType {
  PRIMARY = 'primary',
  SECONDARY = 'secondary',
}

/**
 * Stato del ciclo di vita della quest.
 * Una quest puo' essere ATTIVA (visibile e completabile dai giocatori),
 * DISATTIVATA (creata o sospesa, non disponibile) o ARCHIVED (rimossa
 * permanentemente dalle interfacce ma mantenuta a fini storici).
 */
export enum QuestStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  ARCHIVED = 'archived',
}

/**
 * Tipi geografici di base per le coordinate GPS.
 *
 * Le coordinate vengono memorizzate in formato GeoJSON Point, lo standard
 * usato da MongoDB per le query geografiche (es. "trova quest entro N
 * metri da una posizione"). Lat e lng dell'API REST vengono convertite
 * a/da questo formato negli adapter del repository.
 *
 * IMPORTANTE: l'ordine delle coordinate e' [longitude, latitude], non
 * [latitude, longitude]. Si tratta dello standard GeoJSON / MongoDB.
 */
export interface GeoJsonPoint {
  type: 'Point';
  coordinates: [number, number];
}

/**
 * Sub-schema riutilizzabile per i punti GeoJSON.
 *
 * Centralizza la definizione del tipo Point (coordinate validate come
 * array di due numeri) e viene riferito dagli schemi delle quest
 * principali, secondarie e dei completamenti per coerenza.
 */
const geoJsonPointSchema = new Schema<GeoJsonPoint>(
  {
    type: {
      type: String,
      enum: ['Point'],
      required: true,
      default: 'Point',
    },
    coordinates: {
      type: [Number],
      required: true,
      validate: {
        validator: (v: number[]): boolean => v.length === 2,
        message: 'Le coordinate devono essere [longitude, latitude]',
      },
    },
  },
  { _id: false },
);

/**
 * Interfaccia base condivisa da tutte le tipologie di quest.
 * Corrisponde alla classe Quest del Deliverable D2.
 */
export interface IQuest extends Document {
  name: string;
  description: string;
  type: QuestType;
  status: QuestStatus;
  basePoints: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Estensione di IQuest per le quest principali.
 *
 * Le quest principali sono basate su un QR code fisico nascosto nel
 * territorio. Il giocatore vede sulla mappa una zona di ricerca
 * approssimativa (searchArea), non la posizione esatta del QR
 * (exactPosition), che e' segreta.
 *
 * exactPosition viene popolata dall'Operatore Manutenzione al momento
 * del piazzamento fisico, prima dell'attivazione della quest. Il
 * collectibleId punta al collezionabile sbloccato al completamento.
 */
export interface IPrimaryQuest extends IQuest {
  type: QuestType.PRIMARY;
  searchArea: GeoJsonPoint;
  searchRadiusMeters: number;
  exactPosition: GeoJsonPoint | null;
  validationRadiusMeters: number;
  qrToken: string | null;
  collectibleId: Types.ObjectId | null;
}

/**
 * Estensione di IQuest per le quest secondarie.
 *
 * Le quest secondarie sono basate su check-in geolocalizzato: il
 * giocatore deve entrare entro un raggio definito di una posizione
 * pubblica nota (es. l'ingresso di un museo). Non c'e' QR code ne'
 * collezionabile sbloccato.
 */
export interface ISecondaryQuest extends IQuest {
  type: QuestType.SECONDARY;
  position: GeoJsonPoint;
  checkInRadiusMeters: number;
}

/**
 * Schema base per la quest.
 * Contiene i campi condivisi da quest principali e secondarie.
 */
const questSchema = new Schema<IQuest>(
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
      maxlength: [1000, "La descrizione non puo' superare 1000 caratteri"],
    },
    type: {
      type: String,
      enum: Object.values(QuestType),
      required: true,
    },
    status: {
      type: String,
      enum: Object.values(QuestStatus),
      default: QuestStatus.INACTIVE,
    },
    basePoints: {
      type: Number,
      required: true,
      min: [0, 'I punti base non possono essere negativi'],
    },
  },
  {
    timestamps: true,
    discriminatorKey: 'type',
    collection: 'quests',
  },
);

/**
 * Modello base Quest. I documenti effettivi vengono creati tramite i
 * discriminator (PrimaryQuest, SecondaryQuest).
 */
export const Quest: Model<IQuest> = model<IQuest>('Quest', questSchema);

/**
 * Schema specifico per le quest principali.
 */
const primaryQuestSchema = new Schema<IPrimaryQuest>({
  searchArea: {
    type: geoJsonPointSchema,
    required: true,
  },
  searchRadiusMeters: {
    type: Number,
    required: true,
    min: [10, "Il raggio di ricerca minimo e' 10 metri"],
    max: [10000, "Il raggio di ricerca massimo e' 10000 metri"],
  },
  exactPosition: {
    type: geoJsonPointSchema,
    default: null,
  },
  validationRadiusMeters: {
    type: Number,
    required: true,
    min: [5, "Il raggio di validazione minimo e' 5 metri"],
    max: [200, "Il raggio di validazione massimo e' 200 metri"],
    default: 30,
  },
  qrToken: {
    type: String,
    default: null,
    sparse: true,
    unique: true,
  },
  collectibleId: {
    type: Schema.Types.ObjectId,
    ref: 'Collectible',
    default: null,
  },
});

primaryQuestSchema.index({ searchArea: '2dsphere' });

/**
 * Schema specifico per le quest secondarie.
 */
const secondaryQuestSchema = new Schema<ISecondaryQuest>({
  position: {
    type: geoJsonPointSchema,
    required: true,
  },
  checkInRadiusMeters: {
    type: Number,
    required: true,
    min: [5, "Il raggio di check-in minimo e' 5 metri"],
    max: [500, "Il raggio di check-in massimo e' 500 metri"],
    default: 50,
  },
});

secondaryQuestSchema.index({ position: '2dsphere' });

/**
 * Discriminator per le quest principali.
 * I documenti creati tramite PrimaryQuest.create() avranno type='primary'
 * e dovranno rispettare lo schema esteso.
 */
export const PrimaryQuest: Model<IPrimaryQuest> = Quest.discriminator<IPrimaryQuest>(
  QuestType.PRIMARY,
  primaryQuestSchema,
);

/**
 * Discriminator per le quest secondarie.
 * I documenti creati tramite SecondaryQuest.create() avranno type='secondary'
 * e dovranno rispettare lo schema esteso.
 */
export const SecondaryQuest: Model<ISecondaryQuest> = Quest.discriminator<ISecondaryQuest>(
  QuestType.SECONDARY,
  secondaryQuestSchema,
);

/**
 * Export del sub-schema GeoJSON Point per riutilizzo in altri modelli
 * (es. Completion.model che memorizza la posizione del giocatore al
 * momento del completamento).
 */
export { geoJsonPointSchema };
