import { describe, it, expect, vi } from 'vitest';
import { PlacementStatus, QuestStatus } from '../../src/database/models/Quest.model';
import {
  placeQuest,
  updateQuestPosition,
  reportQuestIssue,
} from '../../src/modules/quests/services/operator.service';
import { createTestPrimaryQuest } from '../fixtures';

// ── placeQuest ─────────────────────────────────────────────────────────────

describe('placeQuest', () => {
  const position = { lat: 46.0667, lng: 11.1217 };
  const token = 'qr_abc123';

  it('places a quest and sets placementStatus to PLACED', async () => {
    const quest = await createTestPrimaryQuest({ qrToken: token });

    const placed = await placeQuest(String(quest._id), position, token);

    expect(placed.placementStatus).toBe(PlacementStatus.PLACED);
    expect(placed.exactPosition).not.toBeNull();
  });

  it('rejects placement when the scanned token does not match the quest token', async () => {
    const quest = await createTestPrimaryQuest({ qrToken: 'qr_correct' });

    await expect(placeQuest(String(quest._id), position, 'qr_wrong')).rejects.toMatchObject({
      code: 'QR_TOKEN_MISMATCH',
    });
  });

  it('rejects placement when the quest has no QR token yet', async () => {
    const quest = await createTestPrimaryQuest({ qrToken: null });

    await expect(placeQuest(String(quest._id), position, 'qr_anything')).rejects.toMatchObject({
      code: 'QUEST_QR_NOT_GENERATED',
    });
  });

  it('rejects placement when the quest is already placed', async () => {
    const quest = await createTestPrimaryQuest({
      qrToken: token,
      exactPosition: { type: 'Point', coordinates: [11.1217, 46.0667] },
      placementStatus: PlacementStatus.PLACED,
    });

    await expect(placeQuest(String(quest._id), position, token)).rejects.toMatchObject({
      code: 'QUEST_ALREADY_PLACED',
    });
  });

  it('rejects placement with an inaccurate GPS fix', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-01T12:00:00Z'));

    const quest = await createTestPrimaryQuest({ qrToken: token });

    await expect(
      placeQuest(String(quest._id), position, token, {
        accuracy: 200, // supera la soglia di 100m
        clientTimestamp: Date.now() - 5_000,
      }),
    ).rejects.toMatchObject({ code: 'OUT_OF_RANGE_ACCURACY' });

    vi.useRealTimers();
  });

  it('rejects placement with a stale GPS fix', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-01T12:00:00Z'));

    const quest = await createTestPrimaryQuest({ qrToken: token });

    await expect(
      placeQuest(String(quest._id), position, token, {
        accuracy: 20,
        clientTimestamp: Date.now() - 120_000, // 2 minuti: supera la soglia di 60s
      }),
    ).rejects.toMatchObject({ code: 'STALE_FIX' });

    vi.useRealTimers();
  });

  it('throws not found for a non-existent quest', async () => {
    await expect(placeQuest('507f1f77bcf86cd799439011', position, 'qr_any')).rejects.toMatchObject({
      code: 'QUEST_NOT_FOUND',
    });
  });
});

// ── updateQuestPosition ────────────────────────────────────────────────────

describe('updateQuestPosition', () => {
  const position = { lat: 46.07, lng: 11.13 };

  it('updates the position of a placed quest', async () => {
    const quest = await createTestPrimaryQuest({
      qrToken: 'qr_placed',
      exactPosition: { type: 'Point', coordinates: [11.1217, 46.0667] },
      placementStatus: PlacementStatus.PLACED,
    });

    const updated = await updateQuestPosition(String(quest._id), position);

    // Coordinate GeoJSON: [lng, lat]
    expect(updated.exactPosition?.coordinates[0]).toBeCloseTo(position.lng, 5);
    expect(updated.exactPosition?.coordinates[1]).toBeCloseTo(position.lat, 5);
  });

  it('rejects position update when the quest is not placed', async () => {
    const quest = await createTestPrimaryQuest({ qrToken: 'qr_noplace' });

    await expect(updateQuestPosition(String(quest._id), position)).rejects.toMatchObject({
      code: 'QUEST_NOT_PLACED',
    });
  });

  it('throws not found for a non-existent quest', async () => {
    await expect(updateQuestPosition('507f1f77bcf86cd799439011', position)).rejects.toMatchObject({
      code: 'QUEST_NOT_FOUND',
    });
  });
});

// ── reportQuestIssue ───────────────────────────────────────────────────────

describe('reportQuestIssue', () => {
  it('sets placementStatus to REPORTED', async () => {
    const quest = await createTestPrimaryQuest({
      qrToken: 'qr_ok',
      exactPosition: { type: 'Point', coordinates: [11.1217, 46.0667] },
      placementStatus: PlacementStatus.PLACED,
    });

    const reported = await reportQuestIssue(String(quest._id));

    expect(reported.placementStatus).toBe(PlacementStatus.REPORTED);
  });

  it('deactivates an active quest when it is reported', async () => {
    const quest = await createTestPrimaryQuest({
      qrToken: 'qr_active',
      exactPosition: { type: 'Point', coordinates: [11.1217, 46.0667] },
      placementStatus: PlacementStatus.PLACED,
      status: QuestStatus.ACTIVE,
    });

    const reported = await reportQuestIssue(String(quest._id));

    expect(reported.status).toBe(QuestStatus.INACTIVE);
  });

  it('throws not found for a non-existent quest', async () => {
    await expect(reportQuestIssue('507f1f77bcf86cd799439011')).rejects.toMatchObject({
      code: 'QUEST_NOT_FOUND',
    });
  });
});
