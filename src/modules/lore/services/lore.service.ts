import { LoreQuestion, LoreAnswer } from '../../../database/models/LoreQuestion.model';
import { Player } from '../../../database/models/User.model';
import { Quest, QuestStatus, QuestType } from '../../../database/models/Quest.model';
import { ConflictError, NotFoundError } from '../../../utils/errors';
import { LoreQuestionView, LoreAnswerResponse } from '@trentino-quest/shared-types';

function todayString(): string {
  return new Date().toISOString().split('T')[0];
}

function dayOfYear(date: Date): number {
  const start = new Date(date.getFullYear(), 0, 0);
  return Math.floor((date.getTime() - start.getTime()) / 86400000);
}

export async function getDailyQuestion(playerId: string): Promise<LoreQuestionView> {
  const questions = await LoreQuestion.find({ active: true });
  if (questions.length === 0)
    throw new NotFoundError('Nessuna domanda disponibile', 'NO_LORE_QUESTIONS');

  const idx = dayOfYear(new Date()) % questions.length;
  const question = questions[idx];
  const date = todayString();

  const existingAnswer = await LoreAnswer.findOne({ playerId, date });

  const view: LoreQuestionView = {
    id: String(question._id),
    text: question.text,
    options: question.options,
    category: question.category,
    alreadyAnswered: !!existingAnswer,
  };

  if (existingAnswer) {
    view.result = {
      correct: existingAnswer.correct,
      correctOptionIndex: question.correctOptionIndex,
      explanation: question.explanation,
    };
  }

  return view;
}

export async function answerDailyQuestion(
  playerId: string,
  optionIndex: number,
): Promise<LoreAnswerResponse> {
  const date = todayString();
  const existing = await LoreAnswer.findOne({ playerId, date });
  if (existing) throw new ConflictError('Hai già risposto oggi', 'ALREADY_ANSWERED');

  const questions = await LoreQuestion.find({ active: true });
  if (questions.length === 0)
    throw new NotFoundError('Nessuna domanda disponibile', 'NO_LORE_QUESTIONS');

  const idx = dayOfYear(new Date()) % questions.length;
  const question = questions[idx];
  const correct = optionIndex === question.correctOptionIndex;

  await LoreAnswer.create({
    playerId,
    questionId: question._id,
    date,
    selectedOption: optionIndex,
    correct,
  });

  let coinsAwarded = 0;
  let mapFragment: { questName: string; hint: string } | null = null;

  if (correct) {
    coinsAwarded = 50;
    await Player.findByIdAndUpdate(playerId, { $inc: { totalPoints: 50 } });

    const secondaryQuests = await Quest.find({
      type: QuestType.SECONDARY,
      status: QuestStatus.ACTIVE,
    });
    if (secondaryQuests.length > 0) {
      const q = secondaryQuests[Math.floor(Math.random() * secondaryQuests.length)];
      mapFragment = {
        questName: q.name,
        hint: `Si trova dove ${q.description.slice(0, 60).toLowerCase()}...`,
      };
    }
  }

  return {
    correct,
    correctOptionIndex: question.correctOptionIndex,
    explanation: question.explanation,
    coinsAwarded,
    mapFragment,
  };
}
