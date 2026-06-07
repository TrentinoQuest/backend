/**
 * Script di seed per Trentino Quest.
 *
 * Popola il database con dati di esempio coerenti con il dominio:
 * - Utenti: 1 admin, 1 operatore, 1 business approvato
 * - 12 player con dati gamification
 * - 150 quest principali + 150 collezionabili (da trentino-quest-seed-data.json)
 * - 300 quest secondarie (da trentino-quest-seed-data.json)
 * - Domande lore, valli PAT, lega iniziale
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
import { LoreQuestion, LoreAnswer } from '../src/database/models/LoreQuestion.model';
import { Valley } from '../src/database/models/Valley.model';
import { LeagueSeason, LeagueMembership, LeagueTier } from '../src/database/models/League.model';
import { DailyQuestAssignment } from '../src/database/models/DailyQuest.model';
import { Kudos } from '../src/database/models/Kudos.model';
import { CoopChallenge } from '../src/database/models/CoopChallenge.model';
import { Coupon } from '../src/database/models/Coupon.model';
import { Friendship } from '../src/database/models/Friendship.model';
import { BusinessType, BusinessApprovalStatus } from '@trentino-quest/shared-types';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ── Helpers ────────────────────────────────────────────────────────────────

function generateQrToken(): string {
  return 'qr_' + randomBytes(16).toString('hex');
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
  await LoreQuestion.deleteMany({});
  await LoreAnswer.deleteMany({});
  await Valley.deleteMany({});
  await LeagueSeason.deleteMany({});
  await LeagueMembership.deleteMany({});
  await DailyQuestAssignment.deleteMany({});
  await Kudos.deleteMany({});
  await CoopChallenge.deleteMany({});
  await Coupon.deleteMany({});
  await Friendship.deleteMany({});
  logger.info('Pulizia completata');
}

// ── Tipi dati JSON ─────────────────────────────────────────────────────────

interface CollectibleSeedData {
  name: string;
  description: string;
  rarity: string;
  lore: string;
  coordinates: { lat: number; lng: number };
  imageUrl: string;
}

interface PrimaryQuestSeedData {
  name: string;
  type: 'primary';
  valley: string;
  description: string;
  lore: string;
  exactPosition: { type: 'Point'; coordinates: [number, number] };
  searchArea: {
    center: { type: 'Point'; coordinates: [number, number] };
    radiusMeters: number;
  };
  basePoints: number;
  status: string;
  placementStatus: string;
  collectible: CollectibleSeedData;
}

interface SecondaryQuestSeedData {
  name: string;
  type: 'secondary';
  valley: string;
  description: string;
  lore: string;
  position: { type: 'Point'; coordinates: [number, number] };
  checkInRadiusMeters: number;
  basePoints: number;
  status: string;
}

type QuestSeedEntry = PrimaryQuestSeedData | SecondaryQuestSeedData;

interface QuestSeedFile {
  _meta: unknown;
  quests: QuestSeedEntry[];
}

// ── Quest da dati JSON ─────────────────────────────────────────────────────

/**
 * Legge trentino-quest-seed-data.json e popola:
 * - Collezionabili (uno per quest principale, upsert su name)
 * - Quest principali con collectibleId collegato (upsert su name)
 * - Quest secondarie (upsert su name)
 */
async function seedQuestsFromData(): Promise<void> {
  const raw = readFileSync(
    join(process.cwd(), 'scripts', 'data', 'trentino-quest-seed-data.json'),
    'utf-8',
  );
  const data = JSON.parse(raw) as QuestSeedFile;
  const quests = data.quests;

  const primaryQuests = quests.filter((q): q is PrimaryQuestSeedData => q.type === 'primary');
  const secondaryQuests = quests.filter((q): q is SecondaryQuestSeedData => q.type === 'secondary');

  let collectiblesCreated = 0;
  let primaryCreated = 0;
  let primaryUpdated = 0;
  let secondaryCreated = 0;
  let secondaryUpdated = 0;

  // Quest principali: prima crea il collezionabile, poi la quest
  for (const q of primaryQuests) {
    const c = q.collectible;

    // Upsert collezionabile su name
    const existingCollectible = await Collectible.findOne({ name: c.name });
    let collectibleDoc;
    if (!existingCollectible) {
      collectibleDoc = await Collectible.create({
        name: c.name,
        description: c.description,
        imageUrl: c.imageUrl,
        rarity: c.rarity as CollectibleRarity,
        lore: c.lore ?? null,
        coordinates: {
          type: 'Point' as const,
          coordinates: [c.coordinates.lng, c.coordinates.lat] as [number, number],
        },
      });
      collectiblesCreated++;
    } else {
      collectibleDoc = existingCollectible;
    }

    const collectibleId = collectibleDoc._id;

    // Upsert quest principale su name
    const existingQuest = await PrimaryQuest.findOne({ name: q.name });
    if (!existingQuest) {
      await PrimaryQuest.create({
        name: q.name,
        description: q.description,
        type: QuestType.PRIMARY,
        status: (q.status as QuestStatus) ?? QuestStatus.ACTIVE,
        basePoints: q.basePoints,
        searchArea: q.searchArea.center,
        searchRadiusMeters: q.searchArea.radiusMeters,
        exactPosition: q.exactPosition ?? null,
        validationRadiusMeters: 30,
        qrToken: generateQrToken(),
        collectibleId,
        placementStatus: (q.placementStatus as PlacementStatus) ?? PlacementStatus.PLACED,
      });
      primaryCreated++;
    } else {
      await PrimaryQuest.findOneAndUpdate(
        { name: q.name },
        {
          $set: {
            description: q.description,
            status: (q.status as QuestStatus) ?? QuestStatus.ACTIVE,
            basePoints: q.basePoints,
            searchArea: q.searchArea.center,
            searchRadiusMeters: q.searchArea.radiusMeters,
            exactPosition: q.exactPosition ?? null,
            collectibleId,
            placementStatus: (q.placementStatus as PlacementStatus) ?? PlacementStatus.PLACED,
          },
        },
      );
      primaryUpdated++;
    }
  }

  // Quest secondarie
  for (const q of secondaryQuests) {
    const existingQuest = await SecondaryQuest.findOne({ name: q.name });
    if (!existingQuest) {
      await SecondaryQuest.create({
        name: q.name,
        description: q.description,
        type: QuestType.SECONDARY,
        status: (q.status as QuestStatus) ?? QuestStatus.ACTIVE,
        basePoints: q.basePoints,
        position: q.position,
        checkInRadiusMeters: q.checkInRadiusMeters ?? 50,
      });
      secondaryCreated++;
    } else {
      await SecondaryQuest.findOneAndUpdate(
        { name: q.name },
        {
          $set: {
            description: q.description,
            status: (q.status as QuestStatus) ?? QuestStatus.ACTIVE,
            basePoints: q.basePoints,
            position: q.position,
            checkInRadiusMeters: q.checkInRadiusMeters ?? 50,
          },
        },
      );
      secondaryUpdated++;
    }
  }

  logger.info(
    {
      collectiblesCreated,
      primaryCreated,
      primaryUpdated,
      secondaryCreated,
      secondaryUpdated,
      totalQuests: primaryCreated + primaryUpdated + secondaryCreated + secondaryUpdated,
    },
    'Quest e collezionabili seedati da dati JSON',
  );
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

// ── Dati gamification demo ─────────────────────────────────────────────────

/**
 * Imposta dati di gamification realistici su tre player per la demo.
 * Idempotente: salta i player che hanno già xp > 0.
 */
async function seedGamificationData(playerIds: Types.ObjectId[]): Promise<void> {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(0, 0, 0, 0);

  const demos: {
    idx: number;
    xp: number;
    level: number;
    currentStreak: number;
    longestStreak: number;
    streakShieldActive: boolean;
    lastQuestDate: Date;
  }[] = [
    {
      idx: 0,
      xp: 650,
      level: 3,
      currentStreak: 5,
      longestStreak: 12,
      streakShieldActive: false,
      lastQuestDate: yesterday,
    },
    {
      idx: 1,
      xp: 350,
      level: 2,
      currentStreak: 3,
      longestStreak: 7,
      streakShieldActive: false,
      lastQuestDate: yesterday,
    },
    {
      idx: 2,
      xp: 200,
      level: 2,
      currentStreak: 7,
      longestStreak: 7,
      streakShieldActive: true,
      lastQuestDate: yesterday,
    },
  ];

  let updated = 0;
  for (const demo of demos) {
    const player = await Player.findById(playerIds[demo.idx]);
    if (!player || player.xp > 0) continue;
    await Player.findByIdAndUpdate(playerIds[demo.idx], {
      xp: demo.xp,
      level: demo.level,
      currentStreak: demo.currentStreak,
      longestStreak: demo.longestStreak,
      streakShieldActive: demo.streakShieldActive,
      lastQuestDate: demo.lastQuestDate,
    });
    updated++;
  }

  logger.info({ updated }, 'Dati gamification demo impostati');
}

// ── Domande lore ──────────────────────────────────────────────────────────

async function seedLoreQuestions(): Promise<void> {
  const count = await LoreQuestion.countDocuments({});
  if (count >= 30) {
    logger.info({ count }, "Domande lore gia' presenti, skip");
    return;
  }

  const questions = [
    // Storia
    {
      text: 'In quale anno si tenne il Concilio di Trento?',
      options: ['1437', '1545', '1618', '1492'],
      correctOptionIndex: 1,
      explanation:
        'Il Concilio di Trento si svolse dal 1545 al 1563 e fu uno dei momenti chiave della Controriforma cattolica.',
      category: 'storia',
    },
    {
      text: 'Come si chiama la fortezza più grande del Trentino?',
      options: ['Castel Beseno', 'Castel Thun', 'Castel Brughier', 'Castel Ivano'],
      correctOptionIndex: 0,
      explanation:
        'Castel Beseno, arroccato sulla Vallagarina, è la fortezza più grande del Trentino.',
      category: 'storia',
    },
    {
      text: 'Chi fu Cesare Battisti?',
      options: [
        'Un pittore rinascimentale trentino',
        'Un geografo e irredentista trentino',
        'Un arcivescovo di Trento',
        'Un condottiero medievale',
      ],
      correctOptionIndex: 1,
      explanation:
        'Cesare Battisti fu geografo, politico e irredentista trentino, giustiziato dagli austriaci nel 1916.',
      category: 'storia',
    },
    {
      text: 'Quale imperatore romano fondò la città di Trento?',
      options: ['Augusto', 'Giulio Cesare', 'Traiano', 'Claudio'],
      correctOptionIndex: 0,
      explanation:
        "Tridentum fu fondata dai Romani nell'89 a.C. sotto il dominio di Augusto come castrum militare.",
      category: 'storia',
    },
    {
      text: 'Come si chiama il museo del Castello del Buonconsiglio?',
      options: [
        'Museo Storico Trentino',
        "Museo Provinciale d'Arte",
        'Museo Nazionale della Montagna',
        'Museo degli Usi e Costumi',
      ],
      correctOptionIndex: 1,
      explanation:
        "Il Castello del Buonconsiglio ospita il Museo Provinciale d'Arte, con opere dal Medioevo al Novecento.",
      category: 'storia',
    },
    // Natura
    {
      text: 'Quale animale simbolo compare sullo stemma del Trentino?',
      options: ['Orso', 'Aquila', 'Cervo', 'Camoscio'],
      correctOptionIndex: 1,
      explanation:
        "L'aquila è il simbolo araldico del Trentino, presente sullo stemma provinciale da secoli.",
      category: 'natura',
    },
    {
      text: 'In quale parco naturale si trova il Lago di Tovel?',
      options: [
        'Parco Nazionale dello Stelvio',
        'Parco Naturale Adamello-Brenta',
        'Parco Naturale Paneveggio',
        'Parco Naturale del Monte Baldo',
      ],
      correctOptionIndex: 1,
      explanation:
        'Il Lago di Tovel si trova nel Parco Naturale Adamello-Brenta, famoso per le sue acque cristalline.',
      category: 'natura',
    },
    {
      text: 'Quale cima delle Dolomiti ha la forma più caratteristica a forma di torre?',
      options: ['Marmolada', 'Catinaccio', 'Tre Cime di Lavaredo', 'Pale di San Martino'],
      correctOptionIndex: 2,
      explanation:
        'Le Tre Cime di Lavaredo sono il simbolo per eccellenza delle Dolomiti, patrimonio UNESCO dal 2009.',
      category: 'natura',
    },
    {
      text: 'Che cosa sono i "lagorai"?',
      options: [
        'Laghi alpini artificiali',
        'Altopiani con laghi e torbiere',
        'Antichi mulini lungo i fiumi',
        'Rocce laviche del vulcano Pasubio',
      ],
      correctOptionIndex: 1,
      explanation:
        'I Lagorai sono una catena montuosa con decine di laghi e torbiere, meno frequentata delle Dolomiti.',
      category: 'natura',
    },
    {
      text: "Quale fiume scorre lungo la Valle dell'Adige?",
      options: ['Brenta', 'Adige', 'Chiese', 'Noce'],
      correctOptionIndex: 1,
      explanation:
        "L'Adige è il secondo fiume più lungo d'Italia e attraversa tutta la Valle dell'Adige trentina.",
      category: 'natura',
    },
    // Leggende
    {
      text: 'Chi è il Re Laurino secondo la leggenda delle Dolomiti?',
      options: [
        'Un gigante custode dei monti',
        'Un re dei nani custode di un giardino di rose',
        'Il principe fondatore di Trento',
        'Uno spirito delle acque alpine',
      ],
      correctOptionIndex: 1,
      explanation:
        "Re Laurino è un nano leggendario che custodiva un giardino di rose sulle Dolomiti. Il suo giardino incantato si illumina al tramonto nel fenomeno dell'Enrosadira.",
      category: 'leggende',
    },
    {
      text: "Cos'è l'Enrosadira?",
      options: [
        'Un vento tipico delle Dolomiti',
        'Il bagliore rosato delle Dolomiti al tramonto',
        'Una danza folcloristica trentina',
        'Un tipo di formaggio locale',
      ],
      correctOptionIndex: 1,
      explanation:
        "L'Enrosadira è il fenomeno ottico che colora le Dolomiti di rosa e viola al tramonto, legato alla leggenda di Re Laurino.",
      category: 'leggende',
    },
    {
      text: "Quale santo è venerato nell'eremo di San Romedio in Val di Non?",
      options: ['San Vigilio', 'San Romedio', 'San Venceslao', "Sant'Adelpreto"],
      correctOptionIndex: 1,
      explanation:
        'San Romedio è un eremita che, secondo la leggenda, domò un orso dopo che questo aveva ucciso il suo cavallo, e lo usò come cavalcatura.',
      category: 'leggende',
    },
    {
      text: 'Secondo la leggenda, perché le acque del Lago di Tovel erano rosse?',
      options: [
        'Per una battaglia medievale',
        "Per un'alga rossa chiamata Glenodinium sanguineum",
        'Per depositi di minerali ferrosi',
        'Per una maledizione di una strega locale',
      ],
      correctOptionIndex: 1,
      explanation:
        "Il Lago di Tovel si tingeva di rosso grazie all'alga unicellulare Glenodinium sanguineum, fenomeno cessato negli anni '60.",
      category: 'leggende',
    },
    {
      text: 'Chi erano i Cimbri del Trentino?',
      options: [
        'Un popolo germanico che si insediò sugli altopiani trentini',
        'Soldati romani di stanza a Tridentum',
        'Tribù celtiche delle valli alpine',
        'Mercanti medievali veneziani',
      ],
      correctOptionIndex: 0,
      explanation:
        'I Cimbri sono una minoranza linguistica di origine germanica che si insediò sugli altopiani trentini nel Medioevo.',
      category: 'leggende',
    },
    // Gastronomia
    {
      text: 'Quale piatto è tipico della cucina trentina?',
      options: ['Risotto al tartufo', 'Strangolapreti', 'Pappardelle al cinghiale', 'Arancini'],
      correctOptionIndex: 1,
      explanation:
        'Gli strangolapreti sono gnocchi di pane e spinaci, uno dei piatti più tipici della tradizione culinaria trentina.',
      category: 'gastronomia',
    },
    {
      text: 'Il Trentino è famoso per la produzione di quale frutto?',
      options: ['Aranci', 'Mele', 'Pesche', 'Uva da tavola'],
      correctOptionIndex: 1,
      explanation:
        'Il Trentino è uno dei principali produttori di mele in Italia, in particolare nella Val di Non.',
      category: 'gastronomia',
    },
    {
      text: "Come si chiama il formaggio tipico dell'Altipiano di Piné?",
      options: ['Asiago', 'Spressa delle Giudicarie', 'Vezzena', 'Puzzone di Moena'],
      correctOptionIndex: 3,
      explanation:
        "Il Puzzone di Moena (Spretz Tzaorì in ladino) è un formaggio a pasta semidura dall'aroma intenso, tipico della Val di Fassa.",
      category: 'gastronomia',
    },
    {
      text: 'Qual è il vitigno autoctono trentino più celebre?',
      options: ['Teroldego', 'Barolo', 'Amarone', 'Nebbiolo'],
      correctOptionIndex: 0,
      explanation:
        'Il Teroldego Rotaliano è il vitigno autoctono più prestigioso del Trentino, coltivato sul Campo Rotaliano.',
      category: 'gastronomia',
    },
    {
      text: 'Cos\'è la "Zelten"?',
      options: [
        'Un vino dolce natalizio',
        'Un pane dolce natalizio con frutta secca',
        'Una grappa aromatizzata alle erbe',
        'Un insaccato tipico della Valsugana',
      ],
      correctOptionIndex: 1,
      explanation:
        'Lo Zelten è un dolce tradizionale natalizio trentino, un pane arricchito con fichi, noci, uvetta e datteri.',
      category: 'gastronomia',
    },
    // Cultura
    {
      text: 'Quale lingua parlano i Ladini delle Dolomiti?',
      options: [
        'Un dialetto del friulano',
        'Il ladino, lingua retoromanza',
        'Un antico dialetto tedesco',
        'Il provenzale alpino',
      ],
      correctOptionIndex: 1,
      explanation:
        'Il ladino è una lingua retoromanza parlata nelle valli dolomitiche, riconosciuta come minoranza linguistica.',
      category: 'cultura',
    },
    {
      text: 'Quale istituzione universitaria ha sede a Trento?',
      options: [
        'Università degli Studi di Bolzano',
        'Università degli Studi di Trento',
        'Politecnico delle Alpi',
        'Accademia Europea di Bolzano',
      ],
      correctOptionIndex: 1,
      explanation:
        "L'Università degli Studi di Trento, fondata nel 1962, è costantemente tra le migliori università italiane per qualità della ricerca.",
      category: 'cultura',
    },
    {
      text: 'Cosa sono le "Malghe"?',
      options: [
        'Antichi ponti in pietra sulle valli',
        'Alpeggi con strutture per la produzione casearia',
        'Chiese romaniche di montagna',
        'Mercati medievali itineranti',
      ],
      correctOptionIndex: 1,
      explanation:
        'Le malghe sono strutture rurali di montagna usate per la monticazione del bestiame e la produzione di formaggi alpini.',
      category: 'cultura',
    },
    {
      text: 'Cosa si celebra il 15 agosto a Ferragosto in Trentino?',
      options: [
        'La festa della vendemmia',
        "L'Assunzione di Maria con feste paesane e sagre",
        "Il giorno dell'autonomia provinciale",
        'La transumanza annuale',
      ],
      correctOptionIndex: 1,
      explanation:
        'Ferragosto è celebrato con processioni religiose, sagre e feste paesane in tutta la provincia.',
      category: 'cultura',
    },
    {
      text: 'Quale museo è dedicato agli usi e costumi della gente trentina?',
      options: [
        'Museo Civico di Rovereto',
        'Museo degli Usi e Costumi della Gente Trentina',
        'MART - Museo di Arte Moderna',
        'Museo Tridentino di Scienze Naturali',
      ],
      correctOptionIndex: 1,
      explanation:
        "Il Museo degli Usi e Costumi della Gente Trentina di San Michele all'Adige è uno dei più importanti musei etnografici d'Italia.",
      category: 'cultura',
    },
    // Sport e territorio
    {
      text: 'Quale famosa corsa ciclistica passa regolarmente per il Trentino?',
      options: ['Tour de France', "Giro d'Italia", 'Vuelta a España', 'Liegi-Bastogne-Liegi'],
      correctOptionIndex: 1,
      explanation:
        "Il Giro d'Italia attraversa spesso le strade del Trentino, con arrivi e partenze iconici come il Passo dello Stelvio.",
      category: 'cultura',
    },
    {
      text: 'Qual è la vetta più alta del Trentino?',
      options: ['Ortles', 'Cima Presanella', 'Adamello', 'Marmolada'],
      correctOptionIndex: 1,
      explanation:
        "La Presanella (3.558 m) è la vetta più alta interamente in territorio trentino, nel gruppo dell'Adamello-Presanella.",
      category: 'natura',
    },
    {
      text: "Che cos'è il Trento Film Festival?",
      options: [
        'Un festival di cinema horror alpino',
        'Il più antico festival dedicato al cinema di montagna ed esplorazione',
        'Una rassegna di film storici sul Concilio di Trento',
        'Un festival di cortometraggi studenteschi',
      ],
      correctOptionIndex: 1,
      explanation:
        "Il Trento Film Festival, fondato nel 1952, è il più antico festival cinematografico dedicato alla montagna e all'esplorazione nel mondo.",
      category: 'cultura',
    },
    {
      text: "Quale specchio d'acqua è il più grande del Trentino?",
      options: [
        'Lago di Garda (parte trentina)',
        'Lago di Caldonazzo',
        'Lago di Molveno',
        'Lago di Levico',
      ],
      correctOptionIndex: 0,
      explanation:
        'Il Lago di Garda ha la sua sponda settentrionale in territorio trentino (Alto Garda trentino), rendendola la parte più grande.',
      category: 'natura',
    },
    {
      text: 'Come si chiama il dialetto germanico parlato in alcune comunità della Valsugana?',
      options: ['Mocheno', 'Cimbro', 'Bavarese antico', 'Alemmanno'],
      correctOptionIndex: 0,
      explanation:
        'Il mocheno (bersntolerisch) è una lingua germanica parlata dalla minoranza mochena nella Valle del Fersina, in Valsugana.',
      category: 'cultura',
    },
    {
      text: 'Dove si trova il MUSE - Museo delle Scienze di Trento?',
      options: [
        'Nel centro storico medievale',
        'Nel quartiere Le Albere, progettato da Renzo Piano',
        'Sul colle del Doss Trento',
        'Nel Castello del Buonconsiglio',
      ],
      correctOptionIndex: 1,
      explanation:
        "Il MUSE si trova nel quartiere Le Albere, riqualificazione dell'ex area industriale Michelin progettata dall'architetto Renzo Piano.",
      category: 'cultura',
    },
  ];

  await LoreQuestion.insertMany(questions.map((q) => ({ ...q, active: true })));
  logger.info({ count: questions.length }, 'Domande lore inserite');
}

// ── Valli ──────────────────────────────────────────────────────────────────

async function seedValleys(): Promise<void> {
  const raw = readFileSync(
    join(process.cwd(), 'scripts', 'data', 'trentino-valleys.json'),
    'utf-8',
  );
  const valleys = JSON.parse(raw) as { name: string; polygon: object }[];

  for (const v of valleys) {
    await Valley.findOneAndUpdate(
      { name: v.name },
      { name: v.name, polygon: v.polygon },
      { upsert: true, returnDocument: 'after' },
    );
  }
  logger.info({ count: valleys.length }, 'Valli seedate da dati PAT');
}

// ── Lega iniziale ──────────────────────────────────────────────────────────

function getMondayOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function getSundayOfWeek(monday: Date): Date {
  const d = new Date(monday);
  d.setUTCDate(d.getUTCDate() + 6);
  d.setUTCHours(23, 59, 59, 999);
  return d;
}

async function seedLeague(playerIds: Types.ObjectId[]): Promise<void> {
  const now = new Date();
  const weekStart = getMondayOfWeek(now);
  const weekEnd = getSundayOfWeek(weekStart);

  // Crea o recupera la stagione corrente
  let season = await LeagueSeason.findOne({ active: true });
  if (!season) {
    season = await LeagueSeason.create({ weekStart, weekEnd, active: true });
    logger.info('Stagione lega iniziale creata');
  } else {
    logger.info("Stagione lega gia' attiva, skip creazione");
  }

  // Crea membership per ogni player che non ne ha già una
  let created = 0;
  const groupId = 'seed-group-1';
  for (const playerId of playerIds) {
    const existing = await LeagueMembership.findOne({ playerId, seasonId: season._id });
    if (!existing) {
      await LeagueMembership.create({
        playerId,
        seasonId: season._id,
        groupId,
        tier: LeagueTier.PORFIDO,
        weeklyXp: 0,
      });
      created++;
    }
  }

  logger.info({ created }, 'Membership lega create');
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

    const playerIds = await seedPlayers();
    await seedGamificationData(playerIds);

    await seedLoreQuestions();
    await seedValleys();
    await seedQuestsFromData();
    await seedLeague(playerIds);

    logger.info('Seed completato con successo');
  } catch (err) {
    logger.fatal({ err }, 'Seed fallito');
    process.exitCode = 1;
  } finally {
    await disconnectFromDatabase();
  }
}

void run();
