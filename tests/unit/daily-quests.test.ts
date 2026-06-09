import { describe, it, expect } from 'vitest';
import { registerPlayer } from '../../src/modules/auth/services/auth.service';
import {
  getDailyQuests,
  completeDailyQuest,
  pickThreeDeterministic,
} from '../../src/modules/quests/services/daily-quest.service';
import { DAILY_QUEST_POOL } from '../../src/config/daily-quests.config';
import { DailyQuestContext, DailyQuestType } from '../../src/database/models/DailyQuest.model';
import { Player } from '../../src/database/models/User.model';

async function createPlayer(suffix = ''): Promise<string> {
  const ts = Date.now() + suffix;
  const { user } = await registerPlayer({
    email: `dq${ts}@test.com`,
    password: 'Password123',
    username: `dqplayer${ts}`,
  });
  return user.id as string;
}

// ── Pool daily quests ─────────────────────────────────────────────────────────

describe('DAILY_QUEST_POOL — struttura', () => {
  it('ha almeno 6 missioni IN_TRENTINO', () => {
    const count = DAILY_QUEST_POOL.filter(
      (q) => q.context === DailyQuestContext.IN_TRENTINO,
    ).length;
    expect(count).toBeGreaterThanOrEqual(6);
  });

  it('ha almeno 6 missioni OUT_OF_REGION', () => {
    const count = DAILY_QUEST_POOL.filter(
      (q) => q.context === DailyQuestContext.OUT_OF_REGION,
    ).length;
    expect(count).toBeGreaterThanOrEqual(6);
  });

  it('ogni missione ha xpReward > 0 e coinsReward > 0', () => {
    for (const q of DAILY_QUEST_POOL) {
      expect(q.xpReward).toBeGreaterThan(0);
      expect(q.coinsReward).toBeGreaterThan(0);
    }
  });

  it('ogni missione ha type, title e description non vuoti', () => {
    for (const q of DAILY_QUEST_POOL) {
      expect(q.type).toBeTruthy();
      expect(q.title.length).toBeGreaterThan(0);
      expect(q.description.length).toBeGreaterThan(0);
    }
  });
});

// ── getDailyQuests ────────────────────────────────────────────────────────────

describe('getDailyQuests', () => {
  it('restituisce esattamente 3 missioni per il contesto IN_TRENTINO', async () => {
    const playerId = await createPlayer('a');
    const view = await getDailyQuests(playerId, DailyQuestContext.IN_TRENTINO);
    expect(view.quests).toHaveLength(3);
  });

  it('restituisce esattamente 3 missioni per il contesto OUT_OF_REGION', async () => {
    const playerId = await createPlayer('b');
    const view = await getDailyQuests(playerId, DailyQuestContext.OUT_OF_REGION);
    expect(view.quests).toHaveLength(3);
  });

  it('le missioni inizialmente non sono completate', async () => {
    const playerId = await createPlayer('c');
    const view = await getDailyQuests(playerId, DailyQuestContext.IN_TRENTINO);
    for (const q of view.quests) {
      expect(q.completed).toBe(false);
      expect(q.completedAt).toBeNull();
    }
  });

  it('è idempotente: seconda chiamata restituisce le stesse missioni', async () => {
    const playerId = await createPlayer('d');
    const first = await getDailyQuests(playerId, DailyQuestContext.IN_TRENTINO);
    const second = await getDailyQuests(playerId, DailyQuestContext.IN_TRENTINO);
    expect(second.quests.map((q) => q.type)).toEqual(first.quests.map((q) => q.type));
  });

  it('è deterministica: due player diversi vedono le stesse missioni nello stesso giorno', async () => {
    const player1 = await createPlayer('det1');
    const player2 = await createPlayer('det2');
    const view1 = await getDailyQuests(player1, DailyQuestContext.IN_TRENTINO);
    const view2 = await getDailyQuests(player2, DailyQuestContext.IN_TRENTINO);
    expect(view2.quests.map((q) => q.type)).toEqual(view1.quests.map((q) => q.type));
  });

  it('include la data nel formato YYYY-MM-DD', async () => {
    const playerId = await createPlayer('e');
    const view = await getDailyQuests(playerId, DailyQuestContext.IN_TRENTINO);
    expect(view.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

// ── completeDailyQuest ────────────────────────────────────────────────────────

describe('completeDailyQuest', () => {
  it('segna la missione come completata e restituisce XP e coins corretti', async () => {
    const playerId = await createPlayer('f');
    const view = await getDailyQuests(playerId, DailyQuestContext.IN_TRENTINO);
    const questType = view.quests[0].type;
    const expectedXp = view.quests[0].xpReward;
    const expectedCoins = view.quests[0].coinsReward;

    const result = await completeDailyQuest(playerId, questType);
    expect(result.xpAwarded).toBe(expectedXp);
    expect(result.coinsAwarded).toBe(expectedCoins);
    expect(result.alreadyCompleted).toBe(false);
  });

  it('aggiorna xp e totalPoints del player', async () => {
    const playerId = await createPlayer('g');
    const view = await getDailyQuests(playerId, DailyQuestContext.IN_TRENTINO);
    const questType = view.quests[0].type;
    const beforePlayer = await Player.findById(playerId);
    const xpBefore = beforePlayer?.xp ?? 0;
    const pointsBefore = beforePlayer?.totalPoints ?? 0;

    const result = await completeDailyQuest(playerId, questType);
    const afterPlayer = await Player.findById(playerId);
    expect(afterPlayer?.xp).toBe(xpBefore + result.xpAwarded);
    expect(afterPlayer?.totalPoints).toBe(pointsBefore + result.coinsAwarded);
  });

  it('è idempotente: seconda chiamata restituisce alreadyCompleted: true e 0 premi', async () => {
    const playerId = await createPlayer('h');
    const view = await getDailyQuests(playerId, DailyQuestContext.IN_TRENTINO);
    const questType = view.quests[0].type;

    await completeDailyQuest(playerId, questType);
    const second = await completeDailyQuest(playerId, questType);
    expect(second.alreadyCompleted).toBe(true);
    expect(second.xpAwarded).toBe(0);
    expect(second.coinsAwarded).toBe(0);
  });

  it('lancia NotFoundError se non ci sono missioni per oggi', async () => {
    const playerId = await createPlayer('i');
    await expect(completeDailyQuest(playerId, DailyQuestType.WALK_2KM)).rejects.toMatchObject({
      code: 'DAILY_QUEST_NOT_FOUND',
    });
  });

  it('lancia NotFoundError se il tipo non è tra le missioni di oggi', async () => {
    const playerId = await createPlayer('j');
    const view = await getDailyQuests(playerId, DailyQuestContext.OUT_OF_REGION);

    const allTypes = Object.values(DailyQuestType);
    const presentTypes = new Set(view.quests.map((q) => q.type));
    const missingType = allTypes.find((t) => !presentTypes.has(t));

    if (missingType) {
      await expect(completeDailyQuest(playerId, missingType)).rejects.toMatchObject({
        code: 'DAILY_QUEST_TYPE_NOT_FOUND',
      });
    }
  });
});

// ── pickThreeDeterministic ────────────────────────────────────────────────────

describe('pickThreeDeterministic', () => {
  const pool = ['a', 'b', 'c', 'd', 'e', 'f'];

  it('è deterministico: stesso giorno → stessa selezione', () => {
    expect(pickThreeDeterministic(pool, 20000)).toEqual(pickThreeDeterministic(pool, 20000));
  });

  it('restituisce sempre 3 elementi distinti', () => {
    for (let day = 20000; day < 20030; day++) {
      const picked = pickThreeDeterministic(pool, day);
      expect(picked).toHaveLength(3);
      expect(new Set(picked).size).toBe(3);
    }
  });

  it('varia la selezione nel corso dei giorni (non solo 2 set fissi)', () => {
    const sets = new Set<string>();
    for (let day = 20000; day < 20030; day++) {
      sets.add(pickThreeDeterministic(pool, day).slice().sort().join(','));
    }
    // La vecchia formula modulare produceva esattamente 2 set distinti
    expect(sets.size).toBeGreaterThan(2);
  });

  it('con pool di dimensione <= 3 restituisce tutto il pool', () => {
    expect(pickThreeDeterministic(['x'], 123)).toEqual(['x']);
    expect(pickThreeDeterministic(['x', 'y'], 123)).toEqual(['x', 'y']);
    expect(pickThreeDeterministic([], 123)).toEqual([]);
  });
});

describe('completeDailyQuest — totali aggiornati', () => {
  it('ritorna totalXp e totalPoints aggiornati e ricalcola il livello', async () => {
    const playerId = await createPlayer('tot');
    // Porta il player vicino alla soglia del livello 2 (200 XP)
    await Player.findByIdAndUpdate(playerId, { xp: 190, totalPoints: 5 });

    const view = await getDailyQuests(playerId, DailyQuestContext.IN_TRENTINO);
    const quest = view.quests[0];

    const result = await completeDailyQuest(playerId, quest.type);

    expect(result.totalXp).toBe(190 + quest.xpReward);
    expect(result.totalPoints).toBe(5 + quest.coinsReward);

    const player = await Player.findById(playerId);
    // Il livello deve essere coerente con gli XP (non stantio)
    expect(player?.level).toBe(quest.xpReward >= 10 ? 2 : 1);
  });
});
