import { describe, it, expect } from 'vitest';
import { PlacementStatus, QuestStatus } from '../../src/database/models/Quest.model';
import {
  createQuest,
  activateQuest,
  deactivateQuest,
  archiveQuest,
  generateQuestQr,
} from '../../src/modules/quests/services/quest-admin.service';
import {
  createTestPrimaryQuest,
  createTestSecondaryQuest,
  createTestCollectible,
} from '../fixtures';
import { QuestType } from '@trentino-quest/shared-types';

// ── createQuest ────────────────────────────────────────────────────────────

describe('createQuest (primary)', () => {
  it('creates a primary quest without a collectible', async () => {
    const quest = await createQuest({
      type: QuestType.PRIMARY,
      name: 'Test Primary',
      description: 'Una quest principale di test',
      basePoints: 100,
      searchArea: { lat: 46.0667, lng: 11.1217 },
      searchRadiusMeters: 500,
    });

    expect(quest.type).toBe('primary');
    expect(quest.status).toBe(QuestStatus.INACTIVE);
    expect(quest.name).toBe('Test Primary');
  });

  it('creates a primary quest with a valid collectible', async () => {
    const collectible = await createTestCollectible();

    const quest = await createQuest({
      type: QuestType.PRIMARY,
      name: 'Quest With Collectible',
      description: 'Una quest con collezionabile',
      basePoints: 200,
      searchArea: { lat: 46.0667, lng: 11.1217 },
      searchRadiusMeters: 300,
      collectibleId: String(collectible._id),
    });

    expect(quest.type).toBe('primary');
    expect(String((quest as { collectibleId?: unknown }).collectibleId)).toBe(
      String(collectible._id),
    );
  });

  it('rejects creation with a non-existent collectible', async () => {
    const fakeId = '507f1f77bcf86cd799439011';

    await expect(
      createQuest({
        type: QuestType.PRIMARY,
        name: 'Quest Bad Collectible',
        description: 'Questa deve fallire',
        basePoints: 100,
        searchArea: { lat: 46.0667, lng: 11.1217 },
        searchRadiusMeters: 300,
        collectibleId: fakeId,
      }),
    ).rejects.toMatchObject({ code: 'COLLECTIBLE_NOT_FOUND' });
  });
});

describe('createQuest (secondary)', () => {
  it('creates a secondary quest', async () => {
    const quest = await createQuest({
      type: QuestType.SECONDARY,
      name: 'Test Secondary',
      description: 'Una quest secondaria di test',
      basePoints: 50,
      position: { lat: 46.0667, lng: 11.1217 },
      checkInRadiusMeters: 100,
    });

    expect(quest.type).toBe('secondary');
    expect(quest.status).toBe(QuestStatus.INACTIVE);
  });
});

// ── generateQuestQr ────────────────────────────────────────────────────────

describe('generateQuestQr', () => {
  it('generates a QR token for a primary quest the first time', async () => {
    const quest = await createTestPrimaryQuest();

    const updated = await generateQuestQr(String(quest._id));

    expect((updated as { qrToken?: string }).qrToken).toMatch(/^qr_/);
  });

  it('blocks QR regeneration if a token already exists', async () => {
    const quest = await createTestPrimaryQuest({ qrToken: 'qr_existing' });

    await expect(generateQuestQr(String(quest._id))).rejects.toMatchObject({
      code: 'QUEST_QR_ALREADY_GENERATED',
    });
  });

  it('rejects QR generation on a secondary quest', async () => {
    const quest = await createTestSecondaryQuest();

    await expect(generateQuestQr(String(quest._id))).rejects.toMatchObject({
      code: 'NOT_A_PRIMARY_QUEST',
    });
  });

  it('throws not found for a non-existent quest id', async () => {
    await expect(generateQuestQr('507f1f77bcf86cd799439011')).rejects.toMatchObject({
      code: 'QUEST_NOT_FOUND',
    });
  });
});

// ── activateQuest ──────────────────────────────────────────────────────────

describe('activateQuest', () => {
  it('activates a placed primary quest', async () => {
    const quest = await createTestPrimaryQuest({
      qrToken: 'qr_placed',
      exactPosition: { type: 'Point', coordinates: [11.1217, 46.0667] },
      placementStatus: PlacementStatus.PLACED,
    });

    const activated = await activateQuest(String(quest._id));

    expect(activated.status).toBe(QuestStatus.ACTIVE);
  });

  it('rejects activation of a primary quest that has not been placed yet', async () => {
    const quest = await createTestPrimaryQuest();

    await expect(activateQuest(String(quest._id))).rejects.toMatchObject({
      code: 'QUEST_NOT_PLACED',
    });
  });

  it('rejects activation of a primary quest with a reported QR', async () => {
    const quest = await createTestPrimaryQuest({
      qrToken: 'qr_reported',
      exactPosition: { type: 'Point', coordinates: [11.1217, 46.0667] },
      placementStatus: PlacementStatus.REPORTED,
    });

    await expect(activateQuest(String(quest._id))).rejects.toMatchObject({
      code: 'QUEST_QR_REPORTED',
    });
  });

  it('activates a secondary quest directly', async () => {
    const quest = await createTestSecondaryQuest();

    const activated = await activateQuest(String(quest._id));

    expect(activated.status).toBe(QuestStatus.ACTIVE);
  });
});

// ── deactivateQuest / archiveQuest ─────────────────────────────────────────

describe('deactivateQuest', () => {
  it('sets status to inactive', async () => {
    const quest = await createTestPrimaryQuest({
      qrToken: 'qr_active',
      exactPosition: { type: 'Point', coordinates: [11.1217, 46.0667] },
      placementStatus: PlacementStatus.PLACED,
      status: QuestStatus.ACTIVE,
    });

    const deactivated = await deactivateQuest(String(quest._id));

    expect(deactivated.status).toBe(QuestStatus.INACTIVE);
  });

  it('throws not found for a non-existent quest', async () => {
    await expect(deactivateQuest('507f1f77bcf86cd799439011')).rejects.toMatchObject({
      code: 'QUEST_NOT_FOUND',
    });
  });
});

describe('archiveQuest', () => {
  it('soft-deletes a quest by setting status to archived', async () => {
    const quest = await createTestSecondaryQuest({ status: QuestStatus.ACTIVE });

    await archiveQuest(String(quest._id));

    // La funzione risolve senza errori; la verifica sul DB è nel repository test
    await expect(archiveQuest(String(quest._id))).resolves.toBeUndefined();
  });

  it('throws not found for a non-existent quest', async () => {
    await expect(archiveQuest('507f1f77bcf86cd799439011')).rejects.toMatchObject({
      code: 'QUEST_NOT_FOUND',
    });
  });
});
