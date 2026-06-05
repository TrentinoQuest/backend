import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { getDailyQuestion, answerDailyQuestion } from '../services/lore.service';
import { UnauthorizedError } from '../../../utils/errors';

export async function getDailyQuestionHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw new UnauthorizedError('Autenticazione richiesta', 'AUTH_REQUIRED');
    const view = await getDailyQuestion(String(req.user._id));
    res.status(200).json(view);
  } catch (err) {
    next(err);
  }
}

const answerSchema = z.object({ optionIndex: z.number().int().min(0).max(3) }).strict();

export async function answerDailyQuestionHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw new UnauthorizedError('Autenticazione richiesta', 'AUTH_REQUIRED');
    const { optionIndex } = answerSchema.parse(req.body);
    const result = await answerDailyQuestion(String(req.user._id), optionIndex);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}
