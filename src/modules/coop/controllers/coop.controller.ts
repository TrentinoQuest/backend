import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import {
  createCoopChallenge,
  getActiveChallenges,
  getChallengeById,
  addProgress,
  nudgePartner,
} from '../services/coop.service';
import { UnauthorizedError } from '../../../utils/errors';
import { CoopChallengeType } from '../../../database/models/CoopChallenge.model';

const createChallengeSchema = z
  .object({
    partnerId: z.string().regex(/^[a-f0-9]{24}$/i),
    type: z
      .enum([
        CoopChallengeType.WALK_50KM,
        CoopChallengeType.COMPLETE_10,
        CoopChallengeType.UNLOCK_5_RARE,
      ] as [string, ...string[]])
      .transform((v) => v as CoopChallengeType),
  })
  .strict();

// value e' auto-dichiarato dal client (km percorsi, quest completate):
// il limite superiore impedisce di completare una sfida con una singola
// chiamata artefatta.
const progressSchema = z.object({ value: z.number().int().min(1).max(10) }).strict();

export async function createCoopChallengeHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw new UnauthorizedError('Autenticazione richiesta', 'AUTH_REQUIRED');
    const { partnerId, type } = createChallengeSchema.parse(req.body);
    const challenge = await createCoopChallenge(String(req.user._id), partnerId, type);
    res.status(201).json(challenge);
  } catch (err) {
    next(err);
  }
}

export async function getActiveChallengesHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw new UnauthorizedError('Autenticazione richiesta', 'AUTH_REQUIRED');
    const challenges = await getActiveChallenges(String(req.user._id));
    res.status(200).json(challenges);
  } catch (err) {
    next(err);
  }
}

export async function getChallengeByIdHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw new UnauthorizedError('Autenticazione richiesta', 'AUTH_REQUIRED');
    const challenge = await getChallengeById(String(req.params.id), String(req.user._id));
    res.status(200).json(challenge);
  } catch (err) {
    next(err);
  }
}

export async function addProgressHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw new UnauthorizedError('Autenticazione richiesta', 'AUTH_REQUIRED');
    const { value } = progressSchema.parse(req.body);
    const challenge = await addProgress(String(req.params.id), String(req.user._id), value);
    res.status(200).json(challenge);
  } catch (err) {
    next(err);
  }
}

export async function nudgePartnerHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw new UnauthorizedError('Autenticazione richiesta', 'AUTH_REQUIRED');
    await nudgePartner(String(req.user._id), String(req.params.partnerId));
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
