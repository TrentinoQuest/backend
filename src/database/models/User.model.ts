import { Schema, model, Document, Model } from 'mongoose';
import bcrypt from 'bcrypt';
import { UserRole } from '@trentino-quest/shared-types';
export { UserRole };
import { BusinessApprovalStatus, BusinessType } from '@trentino-quest/shared-types';
export { BusinessApprovalStatus, BusinessType };

/**
 * Numero di round del salt per bcrypt.
 * 12 è il valore raccomandato per il 2025: bilanciato tra sicurezza
 * (resistenza a brute force) e performance (tempo di hash accettabile).
 */
const BCRYPT_SALT_ROUNDS = 12;

/**
 * Interfaccia base condivisa da tutti i tipi di utente.
 * Corrisponde alla classe astratta Utente del Deliverable D2.
 */
export interface IUser extends Document {
  email: string;
  password: string;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidatePassword: string): Promise<boolean>;
}

/**
 * Estensione di IUser per il ruolo Giocatore.
 * Aggiunge gli attributi specifici della classe Giocatore del D2.
 */
export interface IPlayer extends IUser {
  username: string;
  totalPoints: number;
  registrationDate: Date;
}

/**
 * Estensione di IUser per il ruolo Amministratore.
 * Aggiunge gli attributi specifici della classe Amministratore del D2.
 */
export interface IAdmin extends IUser {
  firstName: string;
  lastName: string;
}

/**
 * Estensione di IUser per il ruolo Operatore Manutenzione.
 * Aggiunge nome e cognome come l'amministratore. L'operatore si occupa
 * del piazzamento fisico dei QR code sul territorio (RF40-45 del D1).
 */
export interface IMaintenance extends IUser {
  firstName: string;
  lastName: string;
}

/**
 * Estensione di IUser per il ruolo Attivita Locale.
 * Aggiunge i dati aziendali e lo stato di approvazione dell'affiliazione.
 */
export interface IBusiness extends IUser {
  businessName: string;
  businessType: BusinessType;
  address: string;
  position: { type: 'Point'; coordinates: [number, number] };
  approvalStatus: BusinessApprovalStatus;
}

/**
 * Schema base per l'utente.
 * Contiene i campi condivisi da tutti i ruoli e il middleware di hashing
 * della password che si applica automaticamente a qualsiasi sottotipo.
 */
const userSchema = new Schema<IUser>(
  {
    email: {
      type: String,
      required: [true, 'Email obbligatoria'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Formato email non valido'],
    },
    password: {
      type: String,
      required: [true, 'Password obbligatoria'],
      minlength: [8, 'La password deve contenere almeno 8 caratteri'],
    },
    role: {
      type: String,
      enum: Object.values(UserRole),
      required: true,
    },
  },
  {
    timestamps: true,
    discriminatorKey: 'role',
    collection: 'users',
  },
);

/**
 * Middleware pre-save: esegue l'hashing della password con bcrypt prima
 * di persistere il documento, ma solo se il campo password è stato
 * modificato. Questo evita di re-hashare la password a ogni update di
 * altri campi del documento.
 *
 * La funzione è async: Mongoose passa automaticamente al middleware
 * successivo quando la promise risolve.
 */
userSchema.pre<IUser>('save', async function hashPassword() {
  if (!this.isModified('password')) {
    return;
  }
  this.password = await bcrypt.hash(this.password, BCRYPT_SALT_ROUNDS);
});

/**
 * Metodo di istanza per confrontare una password in chiaro con quella
 * hashata salvata nel documento. Restituisce true se corrispondono.
 */
userSchema.methods.comparePassword = async function comparePassword(
  this: IUser,
  candidatePassword: string,
): Promise<boolean> {
  return bcrypt.compare(candidatePassword, this.password);
};

/**
 * Modello base User. I documenti effettivi vengono creati tramite i
 * discriminator (Player, Admin), che ereditano lo schema base e
 * aggiungono i campi specifici del ruolo.
 */
export const User: Model<IUser> = model<IUser>('User', userSchema);

/**
 * Schema specifico per il ruolo Giocatore.
 * Eredita tutti i campi di User e aggiunge username, punti totali e
 * data di registrazione come definito nel diagramma delle classi del D2.
 */
const playerSchema = new Schema<IPlayer>({
  username: {
    type: String,
    required: [true, 'Username obbligatorio'],
    unique: true,
    trim: true,
    minlength: [3, 'Lo username deve contenere almeno 3 caratteri'],
    maxlength: [30, 'Lo username non può superare 30 caratteri'],
  },
  totalPoints: {
    type: Number,
    default: 0,
    min: [0, 'I punti totali non possono essere negativi'],
  },
  registrationDate: {
    type: Date,
    default: Date.now,
  },
});

/**
 * Schema specifico per il ruolo Amministratore.
 * Eredita tutti i campi di User e aggiunge nome e cognome come definito
 * nel diagramma delle classi del D2.
 */
const adminSchema = new Schema<IAdmin>({
  firstName: {
    type: String,
    required: [true, 'Nome obbligatorio'],
    trim: true,
  },
  lastName: {
    type: String,
    required: [true, 'Cognome obbligatorio'],
    trim: true,
  },
});

/**
 * Discriminator per il ruolo Giocatore.
 * I documenti creati tramite Player.create() avranno role='player' e
 * dovranno rispettare lo schema esteso (campi base + campi del giocatore).
 */
export const Player: Model<IPlayer> = User.discriminator<IPlayer>(UserRole.PLAYER, playerSchema);

/**
 * Discriminator per il ruolo Amministratore.
 * I documenti creati tramite Admin.create() avranno role='admin' e
 * dovranno rispettare lo schema esteso (campi base + campi dell'admin).
 */
export const Admin: Model<IAdmin> = User.discriminator<IAdmin>(UserRole.ADMIN, adminSchema);

/**
 * Schema specifico per il ruolo Operatore Manutenzione.
 * Eredita tutti i campi di User e aggiunge nome e cognome.
 */
const maintenanceSchema = new Schema<IMaintenance>({
  firstName: {
    type: String,
    required: [true, 'Nome obbligatorio'],
    trim: true,
  },
  lastName: {
    type: String,
    required: [true, 'Cognome obbligatorio'],
    trim: true,
  },
});

/**
 * Discriminator per il ruolo Operatore Manutenzione.
 * I documenti creati tramite Maintenance.create() avranno
 * role='maintenance' e dovranno rispettare lo schema esteso.
 */
export const Maintenance: Model<IMaintenance> = User.discriminator<IMaintenance>(
  UserRole.MAINTENANCE,
  maintenanceSchema,
);

/**
 * Schema specifico per il ruolo Attivita Locale.
 * La posizione e' un GeoJSON Point per consentire query geografiche
 * (es. offerte vicine al giocatore in sviluppi futuri).
 */
const businessSchema = new Schema<IBusiness>({
  businessName: {
    type: String,
    required: [true, 'Nome attivita obbligatorio'],
    trim: true,
    minlength: [2, 'Il nome attivita deve contenere almeno 2 caratteri'],
    maxlength: [120, "Il nome attivita non puo' superare 120 caratteri"],
  },
  businessType: {
    type: String,
    enum: Object.values(BusinessType),
    required: true,
  },
  address: {
    type: String,
    required: [true, 'Indirizzo obbligatorio'],
    trim: true,
    maxlength: [200, "L'indirizzo non puo' superare 200 caratteri"],
  },
  position: {
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
  approvalStatus: {
    type: String,
    enum: Object.values(BusinessApprovalStatus),
    default: BusinessApprovalStatus.PENDING,
  },
});

businessSchema.index({ position: '2dsphere' });

/**
 * Discriminator per il ruolo Attivita Locale.
 */
export const Business: Model<IBusiness> = User.discriminator<IBusiness>(
  UserRole.BUSINESS,
  businessSchema,
);
