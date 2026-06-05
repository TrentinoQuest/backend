import { describe, it, expect } from 'vitest';
import { registerPlayer } from '../../src/modules/auth/services/auth.service';
import {
  getDailyQuestion,
  answerDailyQuestion,
} from '../../src/modules/lore/services/lore.service';
import { LoreQuestion } from '../../src/database/models/LoreQuestion.model';
import { Player } from '../../src/database/models/User.model';
import { SecondaryQuest, QuestType, QuestStatus } from '../../src/database/models/Quest.model';

async function seedQuestions(count = 5): Promise<void> {
  const questions = Array.from({ length: count }, (_, i) => ({
    text: `Domanda di test ${i + 1}?`,
    options: ['Opzione A', 'Opzione B', 'Opzione C', 'Opzione D'],
    correctOptionIndex: 1,
    explanation: `La risposta corretta è la B per la domanda ${i + 1}.`,
    category: 'test',
    active: true,
  }));
  await LoreQuestion.insertMany(questions);
}

async function createPlayer(suffix = ''): Promise<string> {
  const ts = Date.now() + suffix;
  const { user } = await registerPlayer({
    email: `lore${ts}@test.com`,
    password: 'Password123',
    username: `loreplayer${ts}`,
  });
  return user.id as string;
}

// ── getDailyQuestion ──────────────────────────────────────────────────────────

describe('getDailyQuestion', () => {
  it('lancia NotFoundError se non ci sono domande', async () => {
    const playerId = await createPlayer('a');
    await expect(getDailyQuestion(playerId)).rejects.toMatchObject({
      code: 'NO_LORE_QUESTIONS',
    });
  });

  it('restituisce la domanda senza correctOptionIndex nel payload principale', async () => {
    await seedQuestions(5);
    const playerId = await createPlayer('b');
    const view = await getDailyQuestion(playerId);
    expect(view.id).toBeTruthy();
    expect(view.text).toBeTruthy();
    expect(view.options).toHaveLength(4);
    expect(view.alreadyAnswered).toBe(false);
    expect(view.result).toBeUndefined();
  });

  it('restituisce alreadyAnswered: true dopo aver risposto', async () => {
    await seedQuestions(5);
    const playerId = await createPlayer('c');
    await answerDailyQuestion(playerId, 1);
    const view = await getDailyQuestion(playerId);
    expect(view.alreadyAnswered).toBe(true);
    expect(view.result).toBeDefined();
    expect(view.result?.correctOptionIndex).toBe(1);
    expect(view.result?.explanation).toBeTruthy();
  });

  it('la stessa domanda è restituita per lo stesso giorno (deterministica)', async () => {
    await seedQuestions(5);
    const playerId = await createPlayer('d');
    const first = await getDailyQuestion(playerId);
    const second = await getDailyQuestion(playerId);
    expect(first.id).toBe(second.id);
  });
});

// ── answerDailyQuestion ───────────────────────────────────────────────────────

describe('answerDailyQuestion', () => {
  it('risposta corretta: correct: true e coinsAwarded: 50', async () => {
    await seedQuestions(5);
    const playerId = await createPlayer('e');
    const result = await answerDailyQuestion(playerId, 1);
    expect(result.correct).toBe(true);
    expect(result.coinsAwarded).toBe(50);
    expect(result.correctOptionIndex).toBe(1);
    expect(result.explanation).toBeTruthy();
  });

  it('risposta corretta: player riceve 50 coins', async () => {
    await seedQuestions(5);
    const playerId = await createPlayer('f');
    await Player.findByIdAndUpdate(playerId, { coins: 0 });
    await answerDailyQuestion(playerId, 1);
    const updated = await Player.findById(playerId);
    expect(updated?.coins).toBe(50);
  });

  it('risposta errata: correct: false e coinsAwarded: 0', async () => {
    await seedQuestions(5);
    const playerId = await createPlayer('g');
    const result = await answerDailyQuestion(playerId, 0);
    expect(result.correct).toBe(false);
    expect(result.coinsAwarded).toBe(0);
  });

  it('risposta errata: player non riceve coins', async () => {
    await seedQuestions(5);
    const playerId = await createPlayer('h');
    await Player.findByIdAndUpdate(playerId, { coins: 10 });
    await answerDailyQuestion(playerId, 0);
    const updated = await Player.findById(playerId);
    expect(updated?.coins).toBe(10);
  });

  it('seconda risposta nello stesso giorno lancia ConflictError ALREADY_ANSWERED', async () => {
    await seedQuestions(5);
    const playerId = await createPlayer('i');
    await answerDailyQuestion(playerId, 1);
    await expect(answerDailyQuestion(playerId, 0)).rejects.toMatchObject({
      code: 'ALREADY_ANSWERED',
    });
  });

  it('risposta corretta genera un mapFragment se esistono quest secondarie', async () => {
    await seedQuestions(5);
    await SecondaryQuest.create({
      name: 'Quest Test Lore',
      description: 'Una quest di test per il lore quiz.',
      basePoints: 50,
      checkInRadiusMeters: 10,
      position: { type: 'Point', coordinates: [11.12, 46.07] },
      type: QuestType.SECONDARY,
      status: QuestStatus.ACTIVE,
    });
    const playerId = await createPlayer('j');
    const result = await answerDailyQuestion(playerId, 1);
    expect(result.mapFragment).not.toBeNull();
    expect(result.mapFragment?.questName).toBeTruthy();
    expect(result.mapFragment?.hint).toBeTruthy();
  });
});
