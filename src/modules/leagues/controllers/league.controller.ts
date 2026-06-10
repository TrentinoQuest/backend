import { Request, Response, NextFunction } from 'express';
import { getLeagueCurrent, getLeagueHistory } from '../services/league.service';
import { UnauthorizedError } from '../../../utils/errors';

export async function getLeagueCurrentHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw new UnauthorizedError('Autenticazione richiesta', 'AUTH_REQUIRED');
    const data = await getLeagueCurrent(String(req.user._id));
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

export async function getLeagueHistoryHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw new UnauthorizedError('Autenticazione richiesta', 'AUTH_REQUIRED');
    const data = await getLeagueHistory(String(req.user._id));
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}
