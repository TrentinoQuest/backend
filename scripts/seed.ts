/**
 * Script di seed per Trentino Quest.
 *
 * Popola il database con dati di esempio coerenti con il dominio:
 * - 2 collezionabili (uno comune, uno raro)
 * - 3 quest secondarie con check-in geolocalizzato in luoghi noti del Trentino
 * - 2 quest principali con QR code e collezionabile associato
 *
 * Utilizzo:
 *   npm run seed          (aggiunge dati al DB esistente)
 *   npm run seed -- --clean  (azzera prima collections quests/collectibles)
 *
 * Lo script si connette al DB tramite la stessa configurazione del backend,
 * esegue le operazioni e termina. NON e' un servizio in esecuzione continua.
 */

import { connectWithRetry, disconnectFromDatabase } from '../src/database/connection/mongoose';
import { logger } from '../src/config/logger';
import {
  Quest,
  PrimaryQuest,
  SecondaryQuest,
  QuestStatus,
  QuestType,
  PlacementStatus,
} from '../src/database/models/Quest.model';
import { Collectible, CollectibleRarity } from '../src/database/models/Collectible.model';
import { randomBytes } from 'node:crypto';
import { Admin, UserRole, Maintenance, Business } from '../src/database/models/User.model';
import { Offer } from '../src/database/models/Offer.model';
import { BusinessType, BusinessApprovalStatus } from '@trentino-quest/shared-types';

/**
 * Genera un token QR random per le quest principali di esempio.
 *
 * In produzione il token viene generato dall'admin tramite l'endpoint
 * dedicato e stampato/applicato fisicamente al QR code. Per il seed
 * generiamo un valore plausibile a fini di test end-to-end.
 */
function generateQrToken(): string {
  return 'qr_' + randomBytes(16).toString('hex');
}

/**
 * Cancella tutti i dati delle collections gestite da questo seed.
 * Lo username/password degli utenti e i refresh token NON vengono toccati.
 */
async function cleanCollections(): Promise<void> {
  logger.info('Pulizia delle collection quests e collectibles in corso');
  await Quest.deleteMany({});
  await Collectible.deleteMany({});
  await Offer.deleteMany({});
  logger.info('Pulizia completata');
}

/**
 * Inserisce due collezionabili di esempio e ne ritorna gli id.
 */
async function seedCollectibles(): Promise<{
  buonconsiglioId: string;
  cascateId: string;
}> {
  const buonconsiglio = await Collectible.create({
    name: 'Falconiere del Buonconsiglio',
    description:
      "Un emblema medievale che ricorda l'arte della falconeria praticata dai principi vescovi di Trento.",
    imageUrl: 'https://example.com/collectibles/falconiere.png',
    rarity: CollectibleRarity.UNCOMMON,
  });

  const cascate = await Collectible.create({
    name: 'Spirito delle Cascate',
    description:
      'Una rara essenza scintillante che emerge solo nei pressi delle cascate piu' +
      ' nascoste della valle.',
    imageUrl: 'https://example.com/collectibles/cascate.png',
    rarity: CollectibleRarity.RARE,
  });

  logger.info({ collectibleCount: 2 }, 'Collezionabili inseriti');

  return {
    buonconsiglioId: String(buonconsiglio._id),
    cascateId: String(cascate._id),
  };
}

/**
 * Inserisce tre quest secondarie in luoghi turistici noti del Trentino.
 * Ogni quest e' impostata ATTIVA per essere immediatamente visibile.
 *
 * Le coordinate sono in formato GeoJSON [lng, lat] come richiesto da
 * MongoDB.
 */
async function seedSecondaryQuests(): Promise<void> {
  const quests = [
    {
      name: 'Doss Trento',
      description:
        "Sali al Doss Trento, la collina simbolo della citta' che ospita il Mausoleo di Cesare Battisti e regala una vista panoramica unica.",
      basePoints: 50,
      checkInRadiusMeters: 15,
      position: {
        type: 'Point' as const,
        coordinates: [11.118, 46.068],
      },
    },
    {
      name: 'Lago di Tovel',
      description:
        'Raggiungi le sponde del Lago di Tovel, gioiello incastonato nel Parco Naturale Adamello-Brenta, famoso per le sue acque cristalline.',
      basePoints: 80,
      checkInRadiusMeters: 20,
      position: {
        type: 'Point' as const,
        coordinates: [10.9491, 46.2614],
      },
    },
    {
      name: 'Castel Beseno',
      description:
        "Visita Castel Beseno, la piu' grande fortezza del Trentino arroccata sulla collina che domina la Vallagarina.",
      basePoints: 60,
      checkInRadiusMeters: 10,
      position: {
        type: 'Point' as const,
        coordinates: [11.0911, 45.8403],
      },
    },
  ];

  for (const data of quests) {
    await SecondaryQuest.create({
      ...data,
      type: QuestType.SECONDARY,
      status: QuestStatus.ACTIVE,
    });
  }

  logger.info({ secondaryQuestCount: quests.length }, 'Quest secondarie inserite');
}

/**
 * Inserisce due quest principali con QR code e collezionabile associato.
 *
 * Le quest principali simulano un piazzamento gia' avvenuto: exactPosition
 * e qrToken sono popolati, lo status e' ACTIVE.
 *
 * Per i test end-to-end di scansione QR, lo script stampa i token generati
 * cosi' che lo sviluppatore possa usarli direttamente nelle chiamate curl.
 */
async function seedPrimaryQuests(collectibleIds: {
  buonconsiglioId: string;
  cascateId: string;
}): Promise<void> {
  const buonconsiglioToken = generateQrToken();
  const cascateToken = generateQrToken();

  await PrimaryQuest.create({
    name: 'Tesoro del Buonconsiglio',
    description:
      'Esplora il Castello del Buonconsiglio e trova il QR code nascosto nei suoi cortili.',
    basePoints: 150,
    type: QuestType.PRIMARY,
    status: QuestStatus.ACTIVE,
    searchArea: {
      type: 'Point' as const,
      coordinates: [11.1247, 46.0696],
    },
    searchRadiusMeters: 25,
    exactPosition: {
      type: 'Point' as const,
      coordinates: [11.125, 46.07],
    },
    validationRadiusMeters: 5,
    qrToken: buonconsiglioToken,
    collectibleId: collectibleIds.buonconsiglioId,
    placementStatus: PlacementStatus.PLACED,
  });

  await PrimaryQuest.create({
    name: 'Segreto delle Cascate del Varone',
    description:
      'Scendi nella forra delle Cascate del Varone e scopri il QR code custodito tra le rocce umide.',
    basePoints: 200,
    type: QuestType.PRIMARY,
    status: QuestStatus.ACTIVE,
    searchArea: {
      type: 'Point' as const,
      coordinates: [10.8689, 45.9006],
    },
    searchRadiusMeters: 25,
    exactPosition: {
      type: 'Point' as const,
      coordinates: [10.869, 45.9008],
    },
    validationRadiusMeters: 5,
    qrToken: cascateToken,
    collectibleId: collectibleIds.cascateId,
    placementStatus: PlacementStatus.PLACED,
  });

  logger.info({ primaryQuestCount: 2 }, 'Quest principali inserite');
  logger.info(
    {
      tokens: {
        'Tesoro del Buonconsiglio': buonconsiglioToken,
        'Segreto delle Cascate del Varone': cascateToken,
      },
    },
    'QR token generati per test (annotali per le chiamate curl di scan)',
  );
}

/**
 * Inserisce un utente admin di default con credenziali note.
 *
 * Se l'utente esiste gia' (riconosciuto per email), non viene
 * sovrascritto: questo permette di rieseguire il seed senza perdere
 * l'admin esistente. La password viene hashata automaticamente dal
 * middleware pre-save del modello User.
 *
 * Credenziali: admin@trentinoquest.local / AdminPass123
 */
async function seedAdminUser(): Promise<void> {
  const email = 'admin@trentinoquest.local';
  const existing = await Admin.findOne({ email });
  if (existing) {
    logger.info({ email }, "Admin gia' esistente, skip");
    return;
  }

  await Admin.create({
    email,
    password: 'AdminPass123',
    role: UserRole.ADMIN,
    firstName: 'Admin',
    lastName: 'Trentino',
  });

  logger.info({ email }, 'Admin creato (credenziali: admin@trentinoquest.local / AdminPass123)');
}

/**
 * Inserisce un operatore manutenzione di default con credenziali note.
 * Idempotente: se esiste gia', non viene ricreato.
 *
 * Credenziali: operator@trentinoquest.local / OperatorPass123
 */
async function seedOperatorUser(): Promise<void> {
  const email = 'operator@trentinoquest.local';
  const existing = await Maintenance.findOne({ email });
  if (existing) {
    logger.info({ email }, "Operatore gia' esistente, skip");
    return;
  }

  await Maintenance.create({
    email,
    password: 'OperatorPass123',
    firstName: 'Operatore',
    lastName: 'Manutenzione',
  });

  logger.info(
    { email },
    'Operatore creato (credenziali: operator@trentinoquest.local / OperatorPass123)',
  );
}

/**
 * Inserisce un'attivita locale approvata con due offerte di esempio.
 * Idempotente sull'attivita (riconosciuta per email).
 *
 * Credenziali: rifugio@trentinoquest.local / BusinessPass123
 */
async function seedBusinessWithOffers(): Promise<void> {
  const email = 'rifugio@trentinoquest.local';
  let business = await Business.findOne({ email });

  if (!business) {
    business = await Business.create({
      email,
      password: 'BusinessPass123',
      businessName: 'Rifugio Tre Cime',
      businessType: BusinessType.MOUNTAIN_HUT,
      address: 'Localita Tre Cime, 38010 Trentino',
      position: { type: 'Point', coordinates: [11.45, 46.62] },
      approvalStatus: BusinessApprovalStatus.APPROVED,
    });
    logger.info(
      { email },
      'Attivita creata (credenziali: rifugio@trentinoquest.local / BusinessPass123)',
    );
  } else {
    logger.info({ email }, "Attivita gia' esistente, skip creazione");
  }

  // Le offerte vengono ricreate a ogni seed (sono state pulite da cleanCollections).
  await Offer.create({
    businessId: business._id,
    title: 'Sconto 20% sul pranzo',
    description: 'Sconto del 20% su tutti i piatti del menu del giorno.',
    pointsCost: 300,
  });
  await Offer.create({
    businessId: business._id,
    title: 'Borraccia omaggio',
    description: 'Una borraccia termica brandizzata Trentino Quest in regalo.',
    pointsCost: 500,
  });

  logger.info({ offerCount: 2 }, 'Offerte di esempio inserite');
}

/**
 * Punto di ingresso dello script.
 */
async function run(): Promise<void> {
  const shouldClean = process.argv.includes('--clean');
  const abortController = new AbortController();

  try {
    await connectWithRetry(abortController.signal);

    if (shouldClean) {
      await cleanCollections();
    }

    await seedAdminUser();
    await seedOperatorUser();
    await seedOperatorUser();
    await seedBusinessWithOffers();

    const collectibleIds = await seedCollectibles();
    await seedSecondaryQuests();
    await seedPrimaryQuests(collectibleIds);

    logger.info('Seed completato con successo');
  } catch (err) {
    logger.fatal({ err }, 'Seed fallito');
    process.exitCode = 1;
  } finally {
    await disconnectFromDatabase();
  }
}

void run();
