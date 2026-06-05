/**
 * Script di seed per Trentino Quest.
 *
 * Popola il database con dati di esempio coerenti con il dominio:
 * - Utenti: 1 admin, 1 operatore, 1 business approvato
 * - 5 collezionabili
 * - 5 quest secondarie (3 con completamenti, 2 mai completate)
 * - 2 quest principali con QR code
 * - 12 player con punti diversi (leaderboard visibile)
 * - ~35 completamenti distribuiti sugli ultimi 90 giorni (grafici analytics)
 *
 * Utilizzo:
 *   npm run seed             (aggiunge dati al DB esistente, idempotente)
 *   npm run seed -- --clean  (azzera le collection di seed e ricrea tutto)
 *
 * Lo script si connette al DB tramite la stessa configurazione del backend,
 * esegue le operazioni e termina.
 */

import { Types } from 'mongoose';
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
import { Completion } from '../src/database/models/Completion.model';
import { randomBytes } from 'node:crypto';
import { Admin, Player, UserRole, Maintenance, Business } from '../src/database/models/User.model';
import { Offer } from '../src/database/models/Offer.model';
import { BusinessType, BusinessApprovalStatus } from '@trentino-quest/shared-types';

// ── Helpers ────────────────────────────────────────────────────────────────

function generateQrToken(): string {
  return 'qr_' + randomBytes(16).toString('hex');
}

/** Restituisce una data esatta N giorni fa alle ore indicate. */
function daysAgo(n: number, hour = 10): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hour, 0, 0, 0);
  return d;
}

/** Aggiunge un piccolo offset casuale deterministico alle coordinate. */
function nearPosition(lng: number, lat: number, offsetIdx: number): [number, number] {
  const deltas = [0, 0.0002, -0.0002, 0.0003, -0.0003, 0.0001, -0.0001, 0.0004, -0.0004, 0.00015];
  const d = deltas[offsetIdx % deltas.length];
  return [lng + d, lat + d * 0.6];
}

// ── Clean ──────────────────────────────────────────────────────────────────

/**
 * Cancella tutti i dati delle collection di seed.
 * Admin, Operatore e Business vengono ricreati idempotentemente dopo il clean.
 * I RefreshToken vengono rimossi insieme ai Player.
 */
async function cleanCollections(): Promise<void> {
  logger.info('Pulizia delle collection di seed in corso');
  await Completion.deleteMany({});
  await Player.deleteMany({});
  await Quest.deleteMany({});
  await Collectible.deleteMany({});
  await Offer.deleteMany({});
  logger.info('Pulizia completata');
}

// ── Collezionabili ─────────────────────────────────────────────────────────

interface CollectibleIds {
  buonconsiglioId: string;
  cascateId: string;
  aquilaId: string;
  fossiliId: string;
  lagoColdaiId: string;
}

async function seedCollectibles(): Promise<CollectibleIds> {
  const items = [
    {
      key: 'buonconsiglio',
      name: 'Falconiere del Buonconsiglio',
      description:
        "Un emblema medievale che ricorda l'arte della falconeria praticata dai principi vescovi di Trento.",
      imageUrl: 'https://example.com/collectibles/falconiere.png',
      rarity: CollectibleRarity.UNCOMMON,
    },
    {
      key: 'cascate',
      name: 'Spirito delle Cascate',
      description:
        'Una rara essenza scintillante che emerge solo nei pressi delle cascate piu' +
        ' nascoste della valle.',
      imageUrl: 'https://example.com/collectibles/cascate.png',
      rarity: CollectibleRarity.RARE,
    },
    {
      key: 'aquila',
      name: 'Aquila delle Dolomiti',
      description: 'La maestosa aquila reale, simbolo delle vette trentine.',
      imageUrl: 'https://example.com/collectibles/aquila.png',
      rarity: CollectibleRarity.LEGENDARY,
    },
    {
      key: 'fossili',
      name: 'Ammonite Giurassica',
      description: 'Un fossile di ammonite trovato sulle Dolomiti, testimone di mari antichi.',
      imageUrl: 'https://example.com/collectibles/ammonite.png',
      rarity: CollectibleRarity.RARE,
    },
    {
      key: 'lagoColdai',
      name: 'Cristallo del Lago Coldai',
      description: 'Un cristallo trasparente che riflette il blu del lago alpino.',
      imageUrl: 'https://example.com/collectibles/cristallo.png',
      rarity: CollectibleRarity.COMMON,
    },
  ] as const;

  const ids: Record<string, string> = {};
  for (const item of items) {
    const { key, ...data } = item;
    const existing = await Collectible.findOne({ name: data.name });
    const doc = existing ?? (await Collectible.create(data));
    ids[key] = String(doc._id);
  }

  logger.info({ collectibleCount: items.length }, 'Collezionabili inseriti');
  return ids as unknown as CollectibleIds;
}

// ── Quest secondarie ───────────────────────────────────────────────────────

interface QuestPositions {
  dossLng: number;
  dossLat: number;
  tovelLng: number;
  tovelLat: number;
  besenoLng: number;
  besenoLat: number;
}

interface SecondaryQuestIds {
  dossTrentoId: Types.ObjectId;
  lagoTovelId: Types.ObjectId;
  castelBesenoId: Types.ObjectId;
  /** Quest mai completate (per il grafico "zone ignorate") */
  palazzoMagnificaId: Types.ObjectId;
  eremoRomediId: Types.ObjectId;
  positions: QuestPositions;
}

async function seedSecondaryQuests(): Promise<SecondaryQuestIds> {
  const definitions = [
    {
      name: 'Doss Trento',
      description:
        "Sali al Doss Trento, la collina simbolo della citta' che ospita il Mausoleo di Cesare Battisti e regala una vista panoramica unica.",
      basePoints: 50,
      checkInRadiusMeters: 15,
      position: { type: 'Point' as const, coordinates: [11.118, 46.068] as [number, number] },
    },
    {
      name: 'Lago di Tovel',
      description:
        'Raggiungi le sponde del Lago di Tovel, gioiello incastonato nel Parco Naturale Adamello-Brenta, famoso per le sue acque cristalline.',
      basePoints: 80,
      checkInRadiusMeters: 20,
      position: { type: 'Point' as const, coordinates: [10.9491, 46.2614] as [number, number] },
    },
    {
      name: 'Castel Beseno',
      description:
        "Visita Castel Beseno, la piu' grande fortezza del Trentino arroccata sulla collina che domina la Vallagarina.",
      basePoints: 60,
      checkInRadiusMeters: 10,
      position: { type: 'Point' as const, coordinates: [11.0911, 45.8403] as [number, number] },
    },
    // Le seguenti due non ricevono completamenti: compaiono nel grafico "zone ignorate"
    {
      name: 'Palazzo della Magnifica Comunita',
      description:
        "Ammira il palazzo rinascimentale di Cavalese, sede storica della Magnifica Comunita' di Fiemme.",
      basePoints: 70,
      checkInRadiusMeters: 10,
      position: { type: 'Point' as const, coordinates: [11.4553, 46.2913] as [number, number] },
    },
    {
      name: 'Eremo di San Romedio',
      description:
        'Raggiungi il suggestivo eremo di San Romedio, arroccato su uno sperone roccioso in Val di Non.',
      basePoints: 90,
      checkInRadiusMeters: 15,
      position: { type: 'Point' as const, coordinates: [11.0789, 46.3581] as [number, number] },
    },
  ] as const;

  const docIds: Types.ObjectId[] = [];
  for (const data of definitions) {
    const existing = await SecondaryQuest.findOne({ name: data.name });
    const doc =
      existing ??
      (await SecondaryQuest.create({
        ...data,
        type: QuestType.SECONDARY,
        status: QuestStatus.ACTIVE,
      }));
    docIds.push(doc._id);
  }

  logger.info({ secondaryQuestCount: definitions.length }, 'Quest secondarie inserite');

  return {
    dossTrentoId: docIds[0],
    lagoTovelId: docIds[1],
    castelBesenoId: docIds[2],
    palazzoMagnificaId: docIds[3],
    eremoRomediId: docIds[4],
    positions: {
      dossLng: 11.118,
      dossLat: 46.068,
      tovelLng: 10.9491,
      tovelLat: 46.2614,
      besenoLng: 11.0911,
      besenoLat: 45.8403,
    },
  };
}

// ── Quest principali ───────────────────────────────────────────────────────

interface PrimaryQuestIds {
  buonconsiglioId: Types.ObjectId;
  cascateId: Types.ObjectId;
  buonconsiglioToken: string;
  cascateToken: string;
  buonconsiglioLng: number;
  buonconsiglioLat: number;
  cascateLng: number;
  cascateLat: number;
}

async function seedPrimaryQuests(collectibleIds: CollectibleIds): Promise<PrimaryQuestIds> {
  const items = [
    {
      name: 'Tesoro del Buonconsiglio',
      description:
        'Esplora il Castello del Buonconsiglio e trova il QR code nascosto nei suoi cortili.',
      basePoints: 150,
      searchArea: { type: 'Point' as const, coordinates: [11.1247, 46.0696] as [number, number] },
      searchRadiusMeters: 25,
      exactPosition: { type: 'Point' as const, coordinates: [11.125, 46.07] as [number, number] },
      validationRadiusMeters: 5,
      collectibleId: collectibleIds.buonconsiglioId,
      lng: 11.125,
      lat: 46.07,
    },
    {
      name: 'Segreto delle Cascate del Varone',
      description:
        'Scendi nella forra delle Cascate del Varone e scopri il QR code custodito tra le rocce umide.',
      basePoints: 200,
      searchArea: { type: 'Point' as const, coordinates: [10.8689, 45.9006] as [number, number] },
      searchRadiusMeters: 25,
      exactPosition: { type: 'Point' as const, coordinates: [10.869, 45.9008] as [number, number] },
      validationRadiusMeters: 5,
      collectibleId: collectibleIds.cascateId,
      lng: 10.869,
      lat: 45.9008,
    },
  ] as const;

  const results: { id: Types.ObjectId; token: string }[] = [];

  for (const item of items) {
    const { lng, lat, ...questData } = item;
    void lng;
    void lat;
    const existing = await PrimaryQuest.findOne({ name: questData.name });
    let doc = existing;
    if (!doc) {
      const token = generateQrToken();
      doc = await PrimaryQuest.create({
        ...questData,
        type: QuestType.PRIMARY,
        status: QuestStatus.ACTIVE,
        qrToken: token,
        placementStatus: PlacementStatus.PLACED,
      });
      results.push({ id: doc._id, token });
    } else {
      results.push({
        id: doc._id,
        token: (doc as { qrToken?: string }).qrToken ?? '(esistente)',
      });
    }
  }

  logger.info({ primaryQuestCount: items.length }, 'Quest principali inserite');
  logger.info(
    {
      tokens: {
        'Tesoro del Buonconsiglio': results[0].token,
        'Segreto delle Cascate del Varone': results[1].token,
      },
    },
    'QR token per test (usa questi nelle chiamate curl di scan)',
  );

  return {
    buonconsiglioId: results[0].id,
    cascateId: results[1].id,
    buonconsiglioToken: results[0].token,
    cascateToken: results[1].token,
    buonconsiglioLng: 11.125,
    buonconsiglioLat: 46.07,
    cascateLng: 10.869,
    cascateLat: 45.9008,
  };
}

// ── Utenti seed ────────────────────────────────────────────────────────────

async function seedAdminUser(): Promise<void> {
  const email = 'admin@trentinoquest.local';
  if (await Admin.findOne({ email })) {
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

async function seedOperatorUser(): Promise<void> {
  const email = 'operator@trentinoquest.local';
  if (await Maintenance.findOne({ email })) {
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

  const existingOffers = await Offer.countDocuments({ businessId: business._id });
  if (existingOffers === 0) {
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
}

// ── Player ─────────────────────────────────────────────────────────────────

const PLAYER_DATA = [
  { email: 'marco.bianchi@seed.tq', username: 'marco_bianchi' },
  { email: 'giulia.ferrari@seed.tq', username: 'giulia_ferrari' },
  { email: 'luca.rossi@seed.tq', username: 'luca_rossi' },
  { email: 'sara.romano@seed.tq', username: 'sara_romano' },
  { email: 'andrea.conti@seed.tq', username: 'andrea_conti' },
  { email: 'chiara.mancini@seed.tq', username: 'chiara_mancini' },
  { email: 'davide.gallo@seed.tq', username: 'davide_gallo' },
  { email: 'elena.ricci@seed.tq', username: 'elena_ricci' },
  { email: 'matteo.esposito@seed.tq', username: 'matteo_esposito' },
  { email: 'sofia.colombo@seed.tq', username: 'sofia_colombo' },
  { email: 'roberto.bruno@seed.tq', username: 'roberto_bruno' },
  { email: 'valentina.greco@seed.tq', username: 'valentina_greco' },
];

async function seedPlayers(): Promise<Types.ObjectId[]> {
  const ids: Types.ObjectId[] = [];
  for (const data of PLAYER_DATA) {
    let player = await Player.findOne({ email: data.email });
    if (!player) {
      player = await Player.create({ ...data, password: 'PlayerPass123' });
    }
    ids.push(player._id);
  }
  logger.info({ playerCount: ids.length }, 'Player inseriti');
  return ids;
}

// ── Completamenti ──────────────────────────────────────────────────────────

/**
 * Piano dei completamenti per i grafici analytics.
 *
 * Distribuzione progettata per mostrare:
 *  - Top quests: Doss Trento 1°, Lago di Tovel 2°, Castel Beseno 3°
 *  - Heatmap: cluster a Trento, Tovel e Beseno
 *  - Serie temporale: dati su 90 giorni con picchi leggibili
 *  - Leaderboard: p0 e p1 in testa (tutte le quest), poi scalari
 *  - "Zone ignorate": Palazzo Magnifica e Eremo Romedio senza completamenti
 *
 * Ogni riga: [playerIdx, questKey, daysAgo, hour]
 */
const COMPLETION_PLAN: [number, string, number, number][] = [
  // ── Doss Trento (50 pts) ── 9 completamenti
  [0, 'dossTrento', 88, 9],
  [1, 'dossTrento', 80, 14],
  [2, 'dossTrento', 72, 11],
  [3, 'dossTrento', 64, 16],
  [4, 'dossTrento', 50, 10],
  [5, 'dossTrento', 38, 15],
  [6, 'dossTrento', 25, 9],
  [7, 'dossTrento', 14, 13],
  [8, 'dossTrento', 5, 10],

  // ── Lago di Tovel (80 pts) ── 7 completamenti
  [0, 'lagoTovel', 85, 10],
  [1, 'lagoTovel', 75, 9],
  [2, 'lagoTovel', 62, 14],
  [3, 'lagoTovel', 48, 11],
  [4, 'lagoTovel', 33, 16],
  [5, 'lagoTovel', 20, 10],
  [6, 'lagoTovel', 8, 12],

  // ── Castel Beseno (60 pts) ── 5 completamenti
  [0, 'castelBeseno', 82, 15],
  [1, 'castelBeseno', 68, 11],
  [2, 'castelBeseno', 45, 10],
  [3, 'castelBeseno', 28, 14],
  [4, 'castelBeseno', 10, 16],

  // ── Buonconsiglio (150 pts) ── 4 completamenti
  [0, 'buonconsiglio', 78, 11],
  [1, 'buonconsiglio', 55, 14],
  [2, 'buonconsiglio', 30, 10],
  [3, 'buonconsiglio', 12, 15],

  // ── Cascate del Varone (200 pts) ── 2 completamenti
  [0, 'cascate', 70, 13],
  [1, 'cascate', 35, 10],
];

interface QuestLookup {
  dossTrento: { id: Types.ObjectId; lng: number; lat: number; pts: number };
  lagoTovel: { id: Types.ObjectId; lng: number; lat: number; pts: number };
  castelBeseno: { id: Types.ObjectId; lng: number; lat: number; pts: number };
  buonconsiglio: { id: Types.ObjectId; lng: number; lat: number; pts: number };
  cascate: { id: Types.ObjectId; lng: number; lat: number; pts: number };
}

async function seedCompletions(
  playerIds: Types.ObjectId[],
  secondaryIds: SecondaryQuestIds,
  primaryIds: PrimaryQuestIds,
): Promise<void> {
  const questLookup: QuestLookup = {
    dossTrento: {
      id: secondaryIds.dossTrentoId,
      lng: secondaryIds.positions.dossLng,
      lat: secondaryIds.positions.dossLat,
      pts: 50,
    },
    lagoTovel: {
      id: secondaryIds.lagoTovelId,
      lng: secondaryIds.positions.tovelLng,
      lat: secondaryIds.positions.tovelLat,
      pts: 80,
    },
    castelBeseno: {
      id: secondaryIds.castelBesenoId,
      lng: secondaryIds.positions.besenoLng,
      lat: secondaryIds.positions.besenoLat,
      pts: 60,
    },
    buonconsiglio: {
      id: primaryIds.buonconsiglioId,
      lng: primaryIds.buonconsiglioLng,
      lat: primaryIds.buonconsiglioLat,
      pts: 150,
    },
    cascate: {
      id: primaryIds.cascateId,
      lng: primaryIds.cascateLng,
      lat: primaryIds.cascateLat,
      pts: 200,
    },
  };

  // Accumula i punti per aggiornare totalPoints dei player alla fine
  const pointsAccumulator: Map<string, number> = new Map();

  let created = 0;
  let skipped = 0;

  for (const [playerIdx, questKey, days, hour] of COMPLETION_PLAN) {
    const playerId = playerIds[playerIdx];
    const quest = questLookup[questKey as keyof QuestLookup];

    const alreadyExists = await Completion.exists({ playerId, questId: quest.id });
    if (alreadyExists) {
      skipped++;
      continue;
    }

    const [lng, lat] = nearPosition(quest.lng, quest.lat, playerIdx);
    await Completion.create({
      playerId,
      questId: quest.id,
      pointsAwarded: quest.pts,
      position: { type: 'Point', coordinates: [lng, lat] },
      completedAt: daysAgo(days, hour),
    });

    const key = String(playerId);
    pointsAccumulator.set(key, (pointsAccumulator.get(key) ?? 0) + quest.pts);
    created++;
  }

  // Aggiorna totalPoints per ogni player che ha guadagnato punti
  for (const [playerIdStr, pts] of pointsAccumulator) {
    await Player.findByIdAndUpdate(playerIdStr, { $inc: { totalPoints: pts } });
  }

  logger.info({ created, skipped }, 'Completamenti inseriti');
}

// ── Punto di ingresso ──────────────────────────────────────────────────────

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
    await seedBusinessWithOffers();

    const collectibleIds = await seedCollectibles();
    const secondaryIds = await seedSecondaryQuests();
    const primaryIds = await seedPrimaryQuests(collectibleIds);

    const playerIds = await seedPlayers();
    await seedCompletions(playerIds, secondaryIds, primaryIds);

    logger.info('Seed completato con successo');
  } catch (err) {
    logger.fatal({ err }, 'Seed fallito');
    process.exitCode = 1;
  } finally {
    await disconnectFromDatabase();
  }
}

void run();
