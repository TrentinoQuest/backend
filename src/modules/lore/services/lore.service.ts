import { LoreQuestion, LoreAnswer } from '../../../database/models/LoreQuestion.model';
import { Player } from '../../../database/models/User.model';
import { Quest, QuestStatus, QuestType } from '../../../database/models/Quest.model';
import { ConflictError, NotFoundError } from '../../../utils/errors';
import { LoreQuestionView, LoreAnswerResponse } from '@trentino-quest/shared-types';

function todayString(): string {
  return new Date().toISOString().split('T')[0];
}

/**
 * Numero del giorno corrente in UTC (giorni interi dall'epoch).
 * Coerente con todayString(): entrambi cambiano alla mezzanotte UTC,
 * cosi' il selettore della domanda e la chiave delle risposte puntano
 * sempre allo stesso "oggi".
 */
function utcDayNumber(): number {
  return Math.floor(Date.now() / 86_400_000);
}

/**
 * Carica le domande attive con ordinamento stabile per _id.
 *
 * Senza sort esplicito MongoDB restituisce i documenti in ordine
 * naturale, che NON e' garantito stabile: la "domanda del giorno"
 * potrebbe cambiare tra una chiamata e l'altra.
 */
async function findActiveQuestionsStable(): Promise<Awaited<ReturnType<typeof LoreQuestion.find>>> {
  return LoreQuestion.find({ active: true }).sort({ _id: 1 });
}

export async function getDailyQuestion(playerId: string): Promise<LoreQuestionView> {
  const questions = await findActiveQuestionsStable();
  if (questions.length === 0)
    throw new NotFoundError('Nessuna domanda disponibile', 'NO_LORE_QUESTIONS');

  const idx = utcDayNumber() % questions.length;
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

  const questions = await findActiveQuestionsStable();
  if (questions.length === 0)
    throw new NotFoundError('Nessuna domanda disponibile', 'NO_LORE_QUESTIONS');

  const idx = utcDayNumber() % questions.length;
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
