import { describe, it, expect } from 'vitest';
import { AnalyticsGranularity, BusinessApprovalStatus } from '@trentino-quest/shared-types';
import { Player, Business } from '../../src/database/models/User.model';
import { QuestStatus, QuestType, PlacementStatus } from '../../src/database/models/Quest.model';
import { Completion } from '../../src/database/models/Completion.model';
import { Collectible, CollectibleStatus } from '../../src/database/models/Collectible.model';
import {
  createTestPlayer,
  createTestPrimaryQuest,
  createTestSecondaryQuest,
  createTestCollectible,
} from '../fixtures';
import {
  getAnalyticsSummary,
  getCompletionsOverTimeForAdmin,
  getTopQuestsForAdmin,
  getNeverCompletedQuestsForAdmin,
  getCompletionsHeatmapForAdmin,
  getLeaderboardForAdmin,
} from '../../src/modules/analytics/services/analytics.service';

// ── Helpers locali ─────────────────────────────────────────────────────────

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

async function createCompletion(
  playerId: unknown,
  questId: unknown,
  opts: { completedAt?: Date; lng?: number; lat?: number } = {},
) {
  return Completion.create({
    playerId,
    questId,
    pointsAwarded: 100,
    position: {
      type: 'Point',
      coordinates: [opts.lng ?? 11.1217, opts.lat ?? 46.0667],
    },
    completedAt: opts.completedAt ?? new Date(),
  });
}

// ── getAnalyticsSummary ────────────────────────────────────────────────────

describe('getAnalyticsSummary', () => {
  it('ritorna tutti zeri con il DB vuoto', async () => {
    const result = await getAnalyticsSummary();
    expect(result).toEqual({
      totalPlayers: 0,
      totalActivePrimaryQuests: 0,
      totalActiveSecondaryQuests: 0,
      totalCompletions: 0,
      totalApprovedBusinesses: 0,
      totalCollectibles: 0,
      pendingPlacements: 0,
    });
  });

  it('conta solo gli utenti con ruolo PLAYER', async () => {
    await createTestPlayer({ email: 'p1@test.com', username: 'player1' });
    await createTestPlayer({ email: 'p2@test.com', username: 'player2' });
    // Admin non deve essere contato
    await Business.create({
      email: 'biz@test.com',
      password: 'pass1234',
      businessName: 'Bar',
      businessType: 'restaurant',
      address: 'Via Roma 1',
      position: { type: 'Point', coordinates: [11.1, 46.0] },
    });

    const result = await getAnalyticsSummary();
    expect(result.totalPlayers).toBe(2);
  });

  it('conta le quest attive separando primary e secondary', async () => {
    await createTestPrimaryQuest({ status: QuestStatus.ACTIVE, name: 'Primary Uno' });
    await createTestPrimaryQuest({ status: QuestStatus.ACTIVE, name: 'Primary Due' });
    await createTestPrimaryQuest({ status: QuestStatus.INACTIVE, name: 'Primary Tre' });
    await createTestSecondaryQuest({ status: QuestStatus.ACTIVE });
    await createTestSecondaryQuest({ status: QuestStatus.ARCHIVED });

    const result = await getAnalyticsSummary();
    expect(result.totalActivePrimaryQuests).toBe(2);
    expect(result.totalActiveSecondaryQuests).toBe(1);
  });

  it('conta tutti i completamenti', async () => {
    const player = await createTestPlayer();
    const quest1 = await createTestPrimaryQuest({ name: 'Quest Uno' });
    const quest2 = await createTestSecondaryQuest();
    await createCompletion(player._id, quest1._id);
    await createCompletion(player._id, quest2._id);

    const result = await getAnalyticsSummary();
    expect(result.totalCompletions).toBe(2);
  });

  it('conta solo i business approvati', async () => {
    await Business.create({
      email: 'approved@test.com',
      password: 'pass1234',
      businessName: 'Approvato',
      businessType: 'restaurant',
      address: 'Via Uno 1',
      position: { type: 'Point', coordinates: [11.1, 46.0] },
      approvalStatus: BusinessApprovalStatus.APPROVED,
    });
    await Business.create({
      email: 'pending@test.com',
      password: 'pass1234',
      businessName: 'In attesa',
      businessType: 'museum',
      address: 'Via Due 2',
      position: { type: 'Point', coordinates: [11.1, 46.0] },
      approvalStatus: BusinessApprovalStatus.PENDING,
    });

    const result = await getAnalyticsSummary();
    expect(result.totalApprovedBusinesses).toBe(1);
  });

  it('conta solo i collezionabili attivi', async () => {
    await createTestCollectible({ name: 'Attivo' });
    await Collectible.create({
      name: 'Archiviato',
      description: 'old',
      imageUrl: 'https://example.com/img.png',
      rarity: 'common',
      status: CollectibleStatus.ARCHIVED,
    });

    const result = await getAnalyticsSummary();
    expect(result.totalCollectibles).toBe(1);
  });

  it('conta solo le quest primary con placement PENDING', async () => {
    await createTestPrimaryQuest({ name: 'Pending1' }); // default placementStatus = PENDING
    await createTestPrimaryQuest({ name: 'Pending2' });
    await createTestPrimaryQuest({
      name: 'Placed',
      qrToken: 'qr_placed',
      exactPosition: { type: 'Point', coordinates: [11.1, 46.0] },
      placementStatus: PlacementStatus.PLACED,
    });
    await createTestSecondaryQuest(); // secondary: nessun placementStatus

    const result = await getAnalyticsSummary();
    expect(result.pendingPlacements).toBe(2);
  });
});

// ── getCompletionsOverTimeForAdmin ─────────────────────────────────────────

describe('getCompletionsOverTimeForAdmin', () => {
  it("usa la granularita' DAY come default quando non specificata", async () => {
    const result = await getCompletionsOverTimeForAdmin({});
    expect(result.granularity).toBe(AnalyticsGranularity.DAY);
  });

  it('applica il range di 30 giorni di default quando from/to non sono specificati', async () => {
    const before = Date.now();
    const result = await getCompletionsOverTimeForAdmin({});
    const after = Date.now();

    const expectedFrom = new Date(result.to.getTime() - 30 * 24 * 60 * 60 * 1000);
    expect(result.from.getTime()).toBeCloseTo(expectedFrom.getTime(), -3);
    expect(result.to.getTime()).toBeGreaterThanOrEqual(before);
    expect(result.to.getTime()).toBeLessThanOrEqual(after);
  });

  it('ritorna array vuoto quando non ci sono completamenti nel range', async () => {
    const from = daysAgo(10);
    const to = new Date();
    const result = await getCompletionsOverTimeForAdmin({ from, to });
    expect(result.data).toHaveLength(0);
  });

  it('aggrega i completamenti per giorno correttamente', async () => {
    const player = await createTestPlayer();
    const quest1 = await createTestPrimaryQuest({ name: 'Quest Uno' });
    const quest2 = await createTestSecondaryQuest();

    const day1 = new Date('2025-03-10T10:00:00.000Z');
    const day2 = new Date('2025-03-12T15:00:00.000Z');

    await createCompletion(player._id, quest1._id, { completedAt: day1 });
    await createCompletion(player._id, quest2._id, { completedAt: day2 });

    const from = new Date('2025-03-01T00:00:00.000Z');
    const to = new Date('2025-03-31T23:59:59.000Z');
    const result = await getCompletionsOverTimeForAdmin({
      from,
      to,
      granularity: AnalyticsGranularity.DAY,
    });

    expect(result.data).toHaveLength(2);
    expect(result.data[0].count).toBe(1);
    expect(result.data[1].count).toBe(1);
  });

  it("raggruppa piu' completamenti dello stesso giorno in un unico punto", async () => {
    const player1 = await createTestPlayer({ email: 'p1@test.com', username: 'usr1' });
    const player2 = await createTestPlayer({ email: 'p2@test.com', username: 'usr2' });
    const quest1 = await createTestPrimaryQuest({ name: 'Quest Uno' });
    const quest2 = await createTestSecondaryQuest();

    const sameDay1 = new Date('2025-04-05T08:00:00.000Z');
    const sameDay2 = new Date('2025-04-05T20:00:00.000Z');

    await createCompletion(player1._id, quest1._id, { completedAt: sameDay1 });
    await createCompletion(player2._id, quest2._id, { completedAt: sameDay2 });

    const from = new Date('2025-04-01T00:00:00.000Z');
    const to = new Date('2025-04-30T23:59:59.000Z');
    const result = await getCompletionsOverTimeForAdmin({ from, to });

    expect(result.data).toHaveLength(1);
    expect(result.data[0].count).toBe(2);
  });

  it('filtra i completamenti fuori dal range indicato', async () => {
    const player = await createTestPlayer();
    const quest = await createTestPrimaryQuest({ name: 'Quest Vecchia' });

    await createCompletion(player._id, quest._id, {
      completedAt: new Date('2025-01-15T00:00:00.000Z'),
    });

    const from = new Date('2025-03-01T00:00:00.000Z');
    const to = new Date('2025-03-31T00:00:00.000Z');
    const result = await getCompletionsOverTimeForAdmin({ from, to });

    expect(result.data).toHaveLength(0);
  });

  it("usa la granularita' WEEK quando specificata", async () => {
    const player = await createTestPlayer();
    const quest1 = await createTestPrimaryQuest({ name: 'Quest Sett Uno' });
    const quest2 = await createTestSecondaryQuest();

    // Due completamenti in settimane diverse: quest1 e quest2 devono avere nomi diversi
    await createCompletion(player._id, quest1._id, {
      completedAt: new Date('2025-04-07T00:00:00.000Z'),
    });
    await createCompletion(player._id, quest2._id, {
      completedAt: new Date('2025-04-14T00:00:00.000Z'),
    });

    const result = await getCompletionsOverTimeForAdmin({
      from: new Date('2025-04-01T00:00:00.000Z'),
      to: new Date('2025-04-30T23:59:59.000Z'),
      granularity: AnalyticsGranularity.WEEK,
    });

    expect(result.data).toHaveLength(2);
    expect(result.granularity).toBe(AnalyticsGranularity.WEEK);
  });
});

// ── getTopQuestsForAdmin ───────────────────────────────────────────────────

describe('getTopQuestsForAdmin', () => {
  it('ritorna un array vuoto quando non ci sono completamenti', async () => {
    const result = await getTopQuestsForAdmin(10);
    expect(result).toHaveLength(0);
  });

  it('ordina le quest per numero di completamenti discendente', async () => {
    const player1 = await createTestPlayer({ email: 'p1@test.com', username: 'usr1' });
    const player2 = await createTestPlayer({ email: 'p2@test.com', username: 'usr2' });
    const questA = await createTestPrimaryQuest({
      name: 'Quest Alpha',
      status: QuestStatus.ACTIVE,
    });
    const questB = await createTestSecondaryQuest();

    // questA: 2 completamenti, questB: 1
    await createCompletion(player1._id, questA._id);
    await createCompletion(player2._id, questA._id);
    await createCompletion(player1._id, questB._id);

    const result = await getTopQuestsForAdmin(10);
    expect(result).toHaveLength(2);
    expect(result[0].completionCount).toBe(2);
    expect(result[1].completionCount).toBe(1);
    expect(String(result[0].questId)).toBe(String(questA._id));
  });

  it('rispetta il parametro limit', async () => {
    const player = await createTestPlayer();
    const questA = await createTestPrimaryQuest({ name: 'Quest Alfa' });
    const questB = await createTestSecondaryQuest();

    await createCompletion(player._id, questA._id);
    await createCompletion(player._id, questB._id);

    const result = await getTopQuestsForAdmin(1);
    expect(result).toHaveLength(1);
  });

  it('include nome e tipo della quest', async () => {
    const player = await createTestPlayer();
    const quest = await createTestPrimaryQuest({
      name: 'Quest Nominata',
      status: QuestStatus.ACTIVE,
    });
    await createCompletion(player._id, quest._id);

    const result = await getTopQuestsForAdmin(10);
    expect(result[0].name).toBe('Quest Nominata');
    expect(result[0].type).toBe(QuestType.PRIMARY);
  });
});

// ── getNeverCompletedQuestsForAdmin ───────────────────────────────────────

describe('getNeverCompletedQuestsForAdmin', () => {
  it('ritorna le quest attive senza completamenti', async () => {
    await createTestPrimaryQuest({ name: 'Ignorata', status: QuestStatus.ACTIVE });

    const result = await getNeverCompletedQuestsForAdmin();
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Ignorata');
  });

  it('esclude le quest attive che hanno almeno un completamento', async () => {
    const player = await createTestPlayer();
    const completed = await createTestPrimaryQuest({
      name: 'Completata',
      status: QuestStatus.ACTIVE,
    });
    await createTestSecondaryQuest();
    // la quest secondaria ha status INACTIVE di default, non deve apparire

    await createCompletion(player._id, completed._id);

    const result = await getNeverCompletedQuestsForAdmin();
    // completed ha completamenti: esclusa. ignored è INACTIVE: esclusa.
    expect(result).toHaveLength(0);
  });

  it('esclude le quest inattive', async () => {
    await createTestPrimaryQuest({ name: 'Inattiva', status: QuestStatus.INACTIVE });
    await createTestSecondaryQuest(); // default INACTIVE

    const result = await getNeverCompletedQuestsForAdmin();
    expect(result).toHaveLength(0);
  });

  it('esclude le quest archiviate', async () => {
    await createTestPrimaryQuest({ name: 'Archiviata', status: QuestStatus.ARCHIVED });

    const result = await getNeverCompletedQuestsForAdmin();
    expect(result).toHaveLength(0);
  });

  it('ritorna sia primary sia secondary attive mai completate', async () => {
    await createTestPrimaryQuest({ name: 'Primary Ignorata', status: QuestStatus.ACTIVE });
    await createTestSecondaryQuest({ status: QuestStatus.ACTIVE });

    const result = await getNeverCompletedQuestsForAdmin();
    expect(result).toHaveLength(2);
  });
});

// ── getCompletionsHeatmapForAdmin ─────────────────────────────────────────

describe('getCompletionsHeatmapForAdmin', () => {
  it('ritorna un array vuoto quando non ci sono completamenti', async () => {
    const result = await getCompletionsHeatmapForAdmin({});
    expect(result.points).toHaveLength(0);
  });

  it('applica il range di 90 giorni di default quando from/to non sono specificati', async () => {
    const before = Date.now();
    const result = await getCompletionsHeatmapForAdmin({});
    const after = Date.now();

    const expectedFrom = new Date(result.to.getTime() - 90 * 24 * 60 * 60 * 1000);
    expect(result.from.getTime()).toBeCloseTo(expectedFrom.getTime(), -3);
    expect(result.to.getTime()).toBeGreaterThanOrEqual(before);
    expect(result.to.getTime()).toBeLessThanOrEqual(after);
  });

  it('ritorna le coordinate del completamento', async () => {
    const player = await createTestPlayer();
    const quest = await createTestPrimaryQuest({ name: 'Quest GPS' });
    await createCompletion(player._id, quest._id, { lng: 11.5, lat: 46.1 });

    const result = await getCompletionsHeatmapForAdmin({
      from: daysAgo(1),
      to: new Date(),
    });

    expect(result.points).toHaveLength(1);
    expect(result.points[0].position.coordinates[0]).toBe(11.5);
    expect(result.points[0].position.coordinates[1]).toBe(46.1);
  });

  it('filtra i completamenti fuori dal range', async () => {
    const player = await createTestPlayer();
    const quest = await createTestPrimaryQuest({ name: 'Quest Vecchia' });

    await createCompletion(player._id, quest._id, {
      completedAt: new Date('2024-01-01T00:00:00.000Z'),
    });

    const result = await getCompletionsHeatmapForAdmin({
      from: new Date('2025-01-01T00:00:00.000Z'),
      to: new Date('2025-12-31T00:00:00.000Z'),
    });

    expect(result.points).toHaveLength(0);
  });
});

// ── getLeaderboardForAdmin ─────────────────────────────────────────────────

describe('getLeaderboardForAdmin', () => {
  it('ritorna un array vuoto quando non ci sono player', async () => {
    const result = await getLeaderboardForAdmin(10);
    expect(result).toHaveLength(0);
  });

  it('ordina i player per totalPoints discendente', async () => {
    const p1 = await createTestPlayer({ email: 'p1@test.com', username: 'usr1' });
    const p2 = await createTestPlayer({ email: 'p2@test.com', username: 'usr2' });
    const p3 = await createTestPlayer({ email: 'p3@test.com', username: 'usr3' });

    await Player.findByIdAndUpdate(p1._id, { totalPoints: 50 });
    await Player.findByIdAndUpdate(p2._id, { totalPoints: 300 });
    await Player.findByIdAndUpdate(p3._id, { totalPoints: 150 });

    const result = await getLeaderboardForAdmin(10);
    expect(result[0].totalPoints).toBe(300);
    expect(result[1].totalPoints).toBe(150);
    expect(result[2].totalPoints).toBe(50);
  });

  it('rispetta il parametro limit', async () => {
    await createTestPlayer({ email: 'p1@test.com', username: 'usr1' });
    await createTestPlayer({ email: 'p2@test.com', username: 'usr2' });
    await createTestPlayer({ email: 'p3@test.com', username: 'usr3' });

    const result = await getLeaderboardForAdmin(2);
    expect(result).toHaveLength(2);
  });

  it('include username e totalPoints nel risultato', async () => {
    await createTestPlayer({ username: 'campione' });

    const result = await getLeaderboardForAdmin(10);
    expect(result[0].username).toBe('campione');
    expect(typeof result[0].totalPoints).toBe('number');
  });
});
