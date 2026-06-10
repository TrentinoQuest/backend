import { Types } from 'mongoose';
import { IUser } from '../../../database/models/User.model';
import { IQuest } from '../../../database/models/Quest.model';
import { ICollectible } from '../../../database/models/Collectible.model';
import { ICompletion } from '../../../database/models/Completion.model';
import {
  countCompletionsByPlayer,
  listCompletionsByPlayer,
  listCompletedQuestIdsByPlayer,
} from '../repositories/completion.repository';
import { countActiveQuests, findQuestById, isPrimaryQuest } from '../repositories/quest.repository';
import { findCollectiblesByIds } from '../repositories/collectible.repository';
import { CoopChallenge } from '../../../database/models/CoopChallenge.model';

/**
 * Service del modulo quests, parte relativa alle operazioni sul profilo
 * del giocatore: feed completamenti, album dei collezionabili, riepilogo
 * dei progressi.
 *
 * Le operazioni di completamento delle quest e di lista/dettaglio sono
 * implementate in quest.service.ts.
 */

/**
 * Voce del feed dei completamenti: il completion arricchito con la quest
 * associata.
 */
export interface CompletionEntry {
  completion: ICompletion;
  quest: IQuest;
}

/**
 * Voce dell'album: il collezionabile e la data in cui e' stato sbloccato
 * (corrispondente alla data del completamento della quest principale).
 */
export interface CollectibleEntry {
  collectible: ICollectible;
  unlockedAt: Date;
}

/**
 * Riepilogo dei progressi del giocatore.
 */
export interface ProgressSummary {
  totalQuests: number;
  completedQuests: number;
  percentage: number;
}

/**
 * Restituisce i completamenti del giocatore in ordine cronologico
 * decrescente, ognuno arricchito con i dati della quest associata.
 *
 * L'arricchimento avviene caricando le quest una per una. Per le
 * dimensioni tipiche del feed (limit di default 20) e' accettabile.
 * Se in futuro la lista crescera' molto, si puo' ottimizzare con una
 * find unica $in e un join in memoria.
 */
export async function getPlayerCompletions(
  player: IUser,
  limit: number,
  offset: number,
): Promise<CompletionEntry[]> {
  const playerId = player._id;
  const completions = await listCompletionsByPlayer(playerId, limit, offset);

  const entries: CompletionEntry[] = [];
  for (const completion of completions) {
    const quest = await findQuestById(String(completion.questId));
    if (quest) {
      entries.push({ completion, quest });
    }
  }
  return entries;
}

/**
 * Restituisce l'album dei collezionabili del giocatore.
 *
 * Costruisce l'album in tre passi:
 * 1. Recupera tutti gli id delle quest completate dal giocatore
 * 2. Carica le quest e filtra quelle principali con collectibleId
 * 3. Recupera in una sola query i collezionabili corrispondenti
 *
 * L'unlockedAt e' la data del completamento della quest principale che
 * ha sbloccato il collezionabile.
 */
export async function getPlayerCollection(player: IUser): Promise<CollectibleEntry[]> {
  const playerId = player._id;
  const questIds = await listCompletedQuestIdsByPlayer(playerId);

  const collectibleIdsWithUnlockDate: { collectibleId: Types.ObjectId; unlockedAt: Date }[] = [];
  for (const questId of questIds) {
    const quest = await findQuestById(String(questId));
    if (!quest || !isPrimaryQuest(quest)) {
      continue;
    }
    const primaryQuest = quest;
    if (!primaryQuest.collectibleId) {
      continue;
    }
    collectibleIdsWithUnlockDate.push({
      collectibleId: primaryQuest.collectibleId,
      unlockedAt: quest.updatedAt,
    });
  }

  // Premi delle sfide cooperative completate: senza questa parte il
  // collezionabile "sbloccato" annunciato dalla notifica non comparirebbe
  // mai nell'album.
  const coopRewards = await CoopChallenge.find({
    status: 'completed',
    rewardCollectibleId: { $ne: null },
    $or: [{ initiatorId: playerId }, { partnerId: playerId }],
  }).select('rewardCollectibleId completedAt startedAt');
  for (const challenge of coopRewards) {
    if (challenge.rewardCollectibleId) {
      collectibleIdsWithUnlockDate.push({
        collectibleId: challenge.rewardCollectibleId,
        unlockedAt: challenge.completedAt ?? challenge.startedAt,
      });
    }
  }

  if (collectibleIdsWithUnlockDate.length === 0) {
    return [];
  }

  const collectibles = await findCollectiblesByIds(
    collectibleIdsWithUnlockDate.map((entry) => entry.collectibleId),
  );

  const collectibleById = new Map<string, ICollectible>();
  for (const collectible of collectibles) {
    collectibleById.set(String(collectible._id), collectible);
  }

  const entries: CollectibleEntry[] = [];
  for (const { collectibleId, unlockedAt } of collectibleIdsWithUnlockDate) {
    const collectible = collectibleById.get(String(collectibleId));
    if (collectible) {
      entries.push({ collectible, unlockedAt });
    }
  }

  return entries;
}

/**
 * Restituisce il riepilogo dei progressi del giocatore.
 *
 * Calcola la percentuale come rapporto tra quest completate e quest
 * totali attive disponibili. Il parametro zone e' attualmente ignorato
 * perche' la modellazione delle zone non e' ancora definita; sara'
 * raffinato quando arrivera' la feature di filtraggio per zona.
 */
export async function getPlayerProgress(player: IUser, _zone?: string): Promise<ProgressSummary> {
  const playerId = player._id;
  const [totalQuests, completedQuests] = await Promise.all([
    countActiveQuests(),
    countCompletionsByPlayer(playerId),
  ]);

  const percentage = totalQuests > 0 ? Math.round((completedQuests / totalQuests) * 100) : 0;

  return {
    totalQuests,
    completedQuests,
    percentage,
  };
}
