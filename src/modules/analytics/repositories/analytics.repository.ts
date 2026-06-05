import { Types } from 'mongoose';
import { AnalyticsGranularity } from '@trentino-quest/shared-types';
import { User } from '../../../database/models/User.model';
import {
  Quest,
  QuestStatus,
  QuestType,
  PlacementStatus,
} from '../../../database/models/Quest.model';
import { Completion } from '../../../database/models/Completion.model';
import { Collectible, CollectibleStatus } from '../../../database/models/Collectible.model';
import { Player, IPlayer } from '../../../database/models/User.model';
import { UserRole, BusinessApprovalStatus } from '@trentino-quest/shared-types';

/**
 * Repository del modulo analytics.
 *
 * Espone aggregazioni Mongo per la dashboard amministrativa (RF39 del
 * Deliverable D1): flussi turistici, zone visitate/ignorate, stagionalita.
 *
 * Le aggregazioni sono calcolate al volo: il dataset previsto e' nel
 * range delle migliaia di documenti, MongoDB lo elabora in tempi
 * trascurabili senza richiedere caching.
 */

/* ---------------------------- Summary globale --------------------------- */

export interface SummaryCounts {
  totalPlayers: number;
  totalActivePrimaryQuests: number;
  totalActiveSecondaryQuests: number;
  totalCompletions: number;
  totalApprovedBusinesses: number;
  totalCollectibles: number;
  pendingPlacements: number;
}

/**
 * Calcola tutti i contatori globali in parallelo.
 *
 * Le query sono indipendenti tra loro, quindi vengono eseguite tutte
 * insieme con Promise.all per minimizzare la latenza percepita.
 */
export async function getSummaryCounts(): Promise<SummaryCounts> {
  const [
    totalPlayers,
    totalActivePrimaryQuests,
    totalActiveSecondaryQuests,
    totalCompletions,
    totalApprovedBusinesses,
    totalCollectibles,
    pendingPlacements,
  ] = await Promise.all([
    User.countDocuments({ role: UserRole.PLAYER }),
    Quest.countDocuments({ type: QuestType.PRIMARY, status: QuestStatus.ACTIVE }),
    Quest.countDocuments({ type: QuestType.SECONDARY, status: QuestStatus.ACTIVE }),
    Completion.countDocuments({}),
    User.countDocuments({
      role: UserRole.BUSINESS,
      approvalStatus: BusinessApprovalStatus.APPROVED,
    }),
    Collectible.countDocuments({ status: CollectibleStatus.ACTIVE }),
    Quest.countDocuments({
      type: QuestType.PRIMARY,
      placementStatus: PlacementStatus.PENDING,
    }),
  ]);

  return {
    totalPlayers,
    totalActivePrimaryQuests,
    totalActiveSecondaryQuests,
    totalCompletions,
    totalApprovedBusinesses,
    totalCollectibles,
    pendingPlacements,
  };
}

/* ------------------------ Completamenti nel tempo ----------------------- */

/**
 * Mappa la granularita' richiesta nel formato di $dateTrunc di MongoDB.
 */
function mapGranularityToDateTrunc(granularity: AnalyticsGranularity): string {
  switch (granularity) {
    case AnalyticsGranularity.WEEK:
      return 'week';
    case AnalyticsGranularity.MONTH:
      return 'month';
    case AnalyticsGranularity.DAY:
    default:
      return 'day';
  }
}

export interface CompletionsOverTimeRow {
  date: Date;
  count: number;
}

/**
 * Aggrega i completamenti per periodo (day/week/month) nell'intervallo
 * indicato. Include tutti i completamenti, anche quelli relativi a
 * quest archiviate: un completamento e' un evento storico avvenuto e
 * resta valido come misura di flusso turistico.
 */
export async function getCompletionsOverTime(
  from: Date,
  to: Date,
  granularity: AnalyticsGranularity,
): Promise<CompletionsOverTimeRow[]> {
  const unit = mapGranularityToDateTrunc(granularity);

  // $dateTrunc richiede MongoDB >= 5.0. La pipeline raggruppa i
  // completamenti per data troncata all'unita' richiesta e ordina
  // cronologicamente.
  const result = await Completion.aggregate<{
    _id: Date;
    count: number;
  }>([
    {
      $match: {
        completedAt: { $gte: from, $lte: to },
      },
    },
    {
      $group: {
        _id: {
          $dateTrunc: { date: '$completedAt', unit },
        },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  return result.map((r) => ({ date: r._id, count: r.count }));
}

/* ------------------------------ Top quests ------------------------------ */

export interface TopQuestRow {
  questId: Types.ObjectId;
  name: string;
  type: QuestType;
  completionCount: number;
}

/**
 * Restituisce le top N quest per numero di completamenti.
 * Arricchisce con nome e tipo della quest tramite $lookup.
 */
export async function getTopQuests(limit: number): Promise<TopQuestRow[]> {
  const result = await Completion.aggregate<{
    _id: Types.ObjectId;
    count: number;
    quest: { _id: Types.ObjectId; name: string; type: QuestType }[];
  }>([
    {
      $group: {
        _id: '$questId',
        count: { $sum: 1 },
      },
    },
    { $sort: { count: -1 } },
    { $limit: limit },
    {
      $lookup: {
        from: 'quests',
        localField: '_id',
        foreignField: '_id',
        as: 'quest',
      },
    },
  ]);

  return result
    .filter((r) => r.quest.length > 0)
    .map((r) => ({
      questId: r._id,
      name: r.quest[0].name,
      type: r.quest[0].type,
      completionCount: r.count,
    }));
}

/* ------------------------- Quest mai completate ------------------------- */

export interface NeverCompletedQuestRow {
  questId: Types.ObjectId;
  name: string;
  type: QuestType;
  createdAt: Date;
}

/**
 * Restituisce le quest ATTIVE per cui non esiste alcun completamento.
 *
 * Limitiamo l'analisi alle quest attive: una quest archiviata che non
 * e' mai stata completata e' irrilevante (e' stata rimossa); una quest
 * inactive non e' nemmeno visibile ai giocatori, quindi sarebbe falso
 * positivo. Le attive che nessuno completa sono il vero segnale di
 * "zona ignorata" su cui l'admin puo' agire.
 */
export async function getNeverCompletedActiveQuests(): Promise<NeverCompletedQuestRow[]> {
  const result = await Quest.aggregate<{
    _id: Types.ObjectId;
    name: string;
    type: QuestType;
    createdAt: Date;
    completions: { _id: Types.ObjectId }[];
  }>([
    { $match: { status: QuestStatus.ACTIVE } },
    {
      $lookup: {
        from: 'completions',
        localField: '_id',
        foreignField: 'questId',
        as: 'completions',
      },
    },
    { $match: { 'completions.0': { $exists: false } } },
    { $sort: { createdAt: -1 } },
    {
      $project: {
        _id: 1,
        name: 1,
        type: 1,
        createdAt: 1,
      },
    },
  ]);

  return result.map((r) => ({
    questId: r._id,
    name: r.name,
    type: r.type,
    createdAt: r.createdAt,
  }));
}

/* ---------------------------- Heatmap punti ----------------------------- */

export interface HeatmapPointRow {
  position: { type: 'Point'; coordinates: [number, number] };
  completedAt: Date;
}

/**
 * Restituisce le posizioni GPS dei completamenti nell'intervallo dato.
 *
 * Le coordinate sono quelle del giocatore al momento del completamento
 * (memorizzate in Completion.position), non quelle della quest: cosi'
 * la heatmap riflette dove effettivamente sono passati i visitatori.
 */
export async function getCompletionsHeatmap(from: Date, to: Date): Promise<HeatmapPointRow[]> {
  return Completion.find(
    { completedAt: { $gte: from, $lte: to } },
    { position: 1, completedAt: 1, _id: 0 },
  ).sort({ completedAt: -1 });
}

/* ----------------------------- Leaderboard ------------------------------ */

/**
 * Restituisce i top N player per punti totali, ordinati discendenti.
 */
export async function getLeaderboard(limit: number): Promise<IPlayer[]> {
  return Player.find().sort({ totalPoints: -1 }).limit(limit);
}
