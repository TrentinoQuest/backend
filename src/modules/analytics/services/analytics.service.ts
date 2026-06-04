import { AnalyticsGranularity } from '@trentino-quest/shared-types';
import {
  getSummaryCounts,
  getCompletionsOverTime,
  getTopQuests,
  getNeverCompletedActiveQuests,
  getCompletionsHeatmap,
  getLeaderboard,
  SummaryCounts,
  CompletionsOverTimeRow,
  TopQuestRow,
  NeverCompletedQuestRow,
  HeatmapPointRow,
} from '../repositories/analytics.repository';
import { IPlayer } from '../../../database/models/User.model';

/**
 * Service del modulo analytics.
 *
 * Coordina le aggregazioni del repository applicando i default temporali
 * dove richiesto. Le metriche includono i completamenti relativi a quest
 * archiviate (un completamento e' un evento storico e resta valido),
 * con un'eccezione esplicita per "never completed quests" che ha senso
 * solo sulle quest attive.
 */

const DEFAULT_TIME_SERIES_DAYS = 30;
const DEFAULT_HEATMAP_DAYS = 90;

/**
 * Calcola from/to applicando un default in giorni quando non specificati.
 * Se viene fornito solo uno dei due, lascia l'altro al suo limite naturale
 * (ora corrente per to, default-giorni-prima per from).
 */
function resolveDateRange(
  from: Date | undefined,
  to: Date | undefined,
  defaultDays: number,
): { from: Date; to: Date } {
  const resolvedTo = to ?? new Date();
  const resolvedFrom = from ?? new Date(resolvedTo.getTime() - defaultDays * 24 * 60 * 60 * 1000);
  return { from: resolvedFrom, to: resolvedTo };
}

/* -------------------------------- Summary -------------------------------- */

export async function getAnalyticsSummary(): Promise<SummaryCounts> {
  return getSummaryCounts();
}

/* ------------------------ Completamenti nel tempo ----------------------- */

export interface CompletionsOverTimeResult {
  granularity: AnalyticsGranularity;
  from: Date;
  to: Date;
  data: CompletionsOverTimeRow[];
}

/**
 * Recupera la serie temporale dei completamenti.
 * Default: ultimi 30 giorni, granularita' day.
 */
export async function getCompletionsOverTimeForAdmin(input: {
  from?: Date;
  to?: Date;
  granularity?: AnalyticsGranularity;
}): Promise<CompletionsOverTimeResult> {
  const granularity = input.granularity ?? AnalyticsGranularity.DAY;
  const { from, to } = resolveDateRange(input.from, input.to, DEFAULT_TIME_SERIES_DAYS);
  const data = await getCompletionsOverTime(from, to, granularity);
  return { granularity, from, to, data };
}

/* ------------------------------ Top quests ------------------------------ */

export async function getTopQuestsForAdmin(limit: number): Promise<TopQuestRow[]> {
  return getTopQuests(limit);
}

/* ------------------------- Quest mai completate ------------------------- */

export async function getNeverCompletedQuestsForAdmin(): Promise<NeverCompletedQuestRow[]> {
  return getNeverCompletedActiveQuests();
}

/* --------------------------------- Heatmap ------------------------------ */

export interface HeatmapResult {
  from: Date;
  to: Date;
  points: HeatmapPointRow[];
}

/**
 * Recupera i punti per la heatmap dei completamenti.
 * Default: ultimi 90 giorni.
 */
export async function getCompletionsHeatmapForAdmin(input: {
  from?: Date;
  to?: Date;
}): Promise<HeatmapResult> {
  const { from, to } = resolveDateRange(input.from, input.to, DEFAULT_HEATMAP_DAYS);
  const points = await getCompletionsHeatmap(from, to);
  return { from, to, points };
}

/* ------------------------------ Leaderboard ----------------------------- */

export async function getLeaderboardForAdmin(limit: number): Promise<IPlayer[]> {
  return getLeaderboard(limit);
}
