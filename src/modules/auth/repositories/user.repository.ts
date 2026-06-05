import { Player, Admin, User, IUser, IPlayer, IAdmin } from '../../../database/models/User.model';

/**
 * Repository del modulo auth: fornisce le primitive di accesso ai dati
 * relative agli utenti del sistema.
 *
 * È l'unico punto del modulo auth che dialoga direttamente con Mongoose.
 * Il service consuma queste funzioni e non importa mai i modelli direttamente,
 * mantenendo la logica di business indipendente dalla tecnologia di
 * persistenza.
 */

/**
 * Cerca un utente per email, indipendentemente dal ruolo.
 *
 * Usa il modello base User (non i discriminator) per recuperare qualsiasi
 * tipologia di utente. Il documento restituito include il campo role,
 * permettendo al chiamante di discriminare il tipo a runtime.
 */
export async function findUserByEmail(email: string): Promise<IUser | null> {
  return User.findOne({ email });
}

/**
 * Cerca un Giocatore per username.
 *
 * Filtra direttamente sul discriminator Player, quindi restituisce
 * unicamente utenti con role='player'.
 */
export async function findPlayerByUsername(username: string): Promise<IPlayer | null> {
  return Player.findOne({ username });
}

/**
 * Cerca un utente per id, indipendentemente dal ruolo.
 *
 * Utilizzato dal middleware di autenticazione per risolvere l'utente
 * corrispondente all'id contenuto nel JWT.
 */
export async function findUserById(id: string): Promise<IUser | null> {
  return User.findById(id);
}

/**
 * Crea un nuovo Giocatore nel database.
 *
 * Il parametro password viene passato in chiaro: l'hashing è gestito
 * automaticamente dal middleware pre-save dello schema User.
 *
 * Se l'email o lo username sono già in uso, la save fallirà a causa
 * dei vincoli unique sugli indici della collection. L'eccezione viene
 * propagata al chiamante che la traduce in un errore applicativo.
 */
export async function createPlayer(input: {
  email: string;
  password: string;
  username: string;
  playerClass?: string | null;
}): Promise<IPlayer> {
  const player = new Player(input);
  return player.save();
}

/**
 * Crea un nuovo Amministratore nel database.
 *
 * Funzione predisposta per gli script di seed e per future operazioni
 * di amministrazione del backoffice. Non è esposta tramite endpoint
 * pubblici di registrazione: gli admin vengono creati internamente.
 */
export async function createAdmin(input: {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}): Promise<IAdmin> {
  const admin = new Admin(input);
  return admin.save();
}

/**
 * Aggiorna la password di un utente identificato da id.
 *
 * Carica il documento, aggiorna il campo password e salva: questo flusso
 * triggera il middleware pre-save che si occupa di hashare il nuovo valore.
 * Restituisce null se l'utente non esiste.
 */
export async function updatePassword(userId: string, newPassword: string): Promise<IUser | null> {
  const user = await User.findById(userId);
  if (!user) {
    return null;
  }
  user.password = newPassword;
  return user.save();
}
