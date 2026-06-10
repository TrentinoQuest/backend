import { Request, Response, NextFunction } from 'express';
import type {
  AnalyticsSummary,
  CompletionsOverTimeResponse,
  CompletionsHeatmapResponse,
  TopQuestEntry,
  NeverCompletedQuestEntry,
  LeaderboardEntry,
} from '@trentino-quest/shared-types';
import {
  completionsOverTimeQuerySchema,
  heatmapQuerySchema,
  limitQuerySchema,
} from '../validators/analytics.validators';
import {
  getAnalyticsSummary,
  getCompletionsOverTimeForAdmin,
  getTopQuestsForAdmin,
  getNeverCompletedQuestsForAdmin,
  getCompletionsHeatmapForAdmin,
  getLeaderboardForAdmin,
} from '../services/analytics.service';

/**
 * Handler per GET /admin/analytics/summary.
 */
export async function getSummaryHandler(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const counts = await getAnalyticsSummary();
    const response: AnalyticsSummary = {
      totalPlayers: counts.totalPlayers,
      totalActiveQuests: counts.totalActivePrimaryQuests + counts.totalActiveSecondaryQuests,
      totalActivePrimaryQuests: counts.totalActivePrimaryQuests,
      totalActiveSecondaryQuests: counts.totalActiveSecondaryQuests,
      totalCompletions: counts.totalCompletions,
      totalApprovedBusinesses: counts.totalApprovedBusinesses,
      totalCollectibles: counts.totalCollectibles,
      pendingPlacements: counts.pendingPlacements,
    };
    res.status(200).json(response);
  } catch (err) {
    next(err);
  }
}

/**
 * Handler per GET /admin/analytics/completions-over-time.
 */
export async function getCompletionsOverTimeHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const query = completionsOverTimeQuerySchema.parse(req.query);
    const result = await getCompletionsOverTimeForAdmin(query);
    const response: CompletionsOverTimeResponse = {
      granularity: result.granularity,
      from: result.from.toISOString(),
      to: result.to.toISOString(),
      data: result.data.map((d) => ({
        date: d.date.toISOString(),
        count: d.count,
      })),
    };
    res.status(200).json(response);
  } catch (err) {
    next(err);
  }
}

/**
 * Handler per GET /admin/analytics/top-quests.
 */
export async function getTopQuestsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { limit } = limitQuerySchema.parse(req.query);
    const rows = await getTopQuestsForAdmin(limit);
    const response: TopQuestEntry[] = rows.map((r) => ({
      questId: String(r.questId),
      name: r.name,
      type: r.type,
      completionCount: r.completionCount,
    }));
    res.status(200).json(response);
  } catch (err) {
    next(err);
  }
}

/**
 * Handler per GET /admin/analytics/never-completed-quests.
 */
export async function getNeverCompletedQuestsHandler(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const rows = await getNeverCompletedQuestsForAdmin();
    const response: NeverCompletedQuestEntry[] = rows.map((r) => ({
      questId: String(r.questId),
      name: r.name,
      type: r.type,
      createdAt: r.createdAt.toISOString(),
    }));
    res.status(200).json(response);
  } catch (err) {
    next(err);
  }
}

/**
 * Handler per GET /admin/analytics/completions-heatmap.
 */
export async function getCompletionsHeatmapHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const query = heatmapQuerySchema.parse(req.query);
    const result = await getCompletionsHeatmapForAdmin(query);
    const response: CompletionsHeatmapResponse = {
      from: result.from.toISOString(),
      to: result.to.toISOString(),
      points: result.points.map((p) => ({
        lng: p.position.coordinates[0],
        lat: p.position.coordinates[1],
        completedAt: p.completedAt.toISOString(),
      })),
    };
    res.status(200).json(response);
  } catch (err) {
    next(err);
  }
}

/**
 * Handler per GET /admin/analytics/leaderboard.
 */
export async function getLeaderboardHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { limit } = limitQuerySchema.parse(req.query);
    const players = await getLeaderboardForAdmin(limit);
    // La classifica e' ordinata per XP (progresso permanente); totalPoints
    // resta nella response come informazione sulla valuta posseduta.
    const response: LeaderboardEntry[] = players.map((p) => ({
      playerId: String(p._id),
      username: p.username,
      totalPoints: p.totalPoints,
      xp: p.xp,
      level: p.level,
    }));
    res.status(200).json(response);
  } catch (err) {
    next(err);
  }
}
