import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app';
import { createTestAdmin, createTestMaintenance, createTestPlayer } from '../fixtures';
import { issueTokenPair } from '../../src/modules/auth/services/auth.service';

async function getTokenFor(user: Parameters<typeof issueTokenPair>[0]): Promise<string> {
  const pair = await issueTokenPair(user);
  return pair.accessToken;
}

describe('Quest lifecycle: admin crea → genera QR → operatore piazza → admin attiva', () => {
  it('completes the full primary quest lifecycle', async () => {
    const admin = await createTestAdmin({ email: 'lc-admin@test.com' });
    const operator = await createTestMaintenance({ email: 'lc-operator@test.com' });
    const adminToken = await getTokenFor(admin);
    const operatorToken = await getTokenFor(operator);

    // 1. Admin crea la quest principale (searchRadiusMeters max 60 per il validator)
    const createRes = await request(app)
      .post('/api/v1/admin/quests')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        type: 'primary',
        name: 'Quest Lifecycle Test',
        description: 'Una quest per il test del ciclo di vita completo',
        basePoints: 100,
        searchArea: { lat: 46.0667, lng: 11.1217 },
        searchRadiusMeters: 50,
      });

    expect(createRes.status).toBe(201);
    const questId = createRes.body.id as string;
    expect(createRes.body.status).toBe('inactive');
    expect(createRes.body.type).toBe('primary');

    // 2. Admin genera il QR token
    const qrRes = await request(app)
      .post(`/api/v1/admin/quests/${questId}/generate-qr`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(qrRes.status).toBe(200);
    expect(qrRes.body.qrToken).toMatch(/^qr_/);
    const qrToken = qrRes.body.qrToken as string;

    // 3. Seconda chiamata a generate-qr deve restituire 409 QUEST_QR_ALREADY_GENERATED
    const dupQrRes = await request(app)
      .post(`/api/v1/admin/quests/${questId}/generate-qr`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(dupQrRes.status).toBe(409);
    expect(dupQrRes.body.code).toBe('QUEST_QR_ALREADY_GENERATED');

    // 4. Tentativo di attivazione prima del piazzamento deve restituire 409 QUEST_NOT_PLACED
    const earlyActivateRes = await request(app)
      .post(`/api/v1/admin/quests/${questId}/activate`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(earlyActivateRes.status).toBe(409);
    expect(earlyActivateRes.body.code).toBe('QUEST_NOT_PLACED');

    // 5. Operatore piazza il QR (scansiona il token corretto)
    const placeRes = await request(app)
      .post(`/api/v1/operator/quests/${questId}/place`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        exactPosition: { lat: 46.068, lng: 11.123 },
        scannedToken: qrToken,
      });

    expect(placeRes.status).toBe(200);
    expect(placeRes.body.placementStatus).toBe('placed');

    // 6. Admin attiva la quest (ora piazzata)
    const activateRes = await request(app)
      .post(`/api/v1/admin/quests/${questId}/activate`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(activateRes.status).toBe(200);
    expect(activateRes.body.status).toBe('active');
  });

  it('blocks operator from using admin endpoints (403 INSUFFICIENT_ROLE)', async () => {
    const operator = await createTestMaintenance({ email: 'role-op@test.com' });
    const operatorToken = await getTokenFor(operator);

    const res = await request(app)
      .post('/api/v1/admin/quests')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        type: 'secondary',
        name: 'Blocked Quest',
        description: 'Non deve essere creata',
        basePoints: 50,
        position: { lat: 46.0, lng: 11.0 },
        checkInRadiusMeters: 10,
      });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('INSUFFICIENT_ROLE');
  });

  it('blocks placement with wrong QR token (409 QR_TOKEN_MISMATCH)', async () => {
    const admin = await createTestAdmin({ email: 'mismatch-admin@test.com' });
    const operator = await createTestMaintenance({ email: 'mismatch-op@test.com' });
    const adminToken = await getTokenFor(admin);
    const operatorToken = await getTokenFor(operator);

    const createRes = await request(app)
      .post('/api/v1/admin/quests')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        type: 'primary',
        name: 'Mismatch Quest',
        description: 'Per testare il mismatch del token',
        basePoints: 50,
        searchArea: { lat: 46.0, lng: 11.0 },
        searchRadiusMeters: 30,
      });
    const questId = createRes.body.id as string;

    await request(app)
      .post(`/api/v1/admin/quests/${questId}/generate-qr`)
      .set('Authorization', `Bearer ${adminToken}`);

    const placeRes = await request(app)
      .post(`/api/v1/operator/quests/${questId}/place`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        exactPosition: { lat: 46.0, lng: 11.0 },
        scannedToken: 'qr_wrong_token',
      });

    expect(placeRes.status).toBe(409);
    expect(placeRes.body.code).toBe('QR_TOKEN_MISMATCH');
  });
});

describe('Quest check-in (player)', () => {
  it('player checks in a secondary quest within radius and gets points', async () => {
    const admin = await createTestAdmin({ email: 'checkin-admin@test.com' });
    const player = await createTestPlayer({
      email: 'checkin-player@test.com',
      username: 'checkinplayer',
    });
    const adminToken = await getTokenFor(admin);
    const playerToken = await getTokenFor(player);

    // Admin crea e attiva una quest secondaria (checkInRadiusMeters max 20)
    const createRes = await request(app)
      .post('/api/v1/admin/quests')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        type: 'secondary',
        name: 'Check-in Quest',
        description: 'Quest per test check-in',
        basePoints: 50,
        position: { lat: 46.0667, lng: 11.1217 },
        checkInRadiusMeters: 15,
      });
    const questId = createRes.body.id as string;

    await request(app)
      .post(`/api/v1/admin/quests/${questId}/activate`)
      .set('Authorization', `Bearer ${adminToken}`);

    // Il giocatore è praticamente sullo stesso punto (< 2 metri)
    const checkInRes = await request(app)
      .post(`/api/v1/quests/${questId}/check-in`)
      .set('Authorization', `Bearer ${playerToken}`)
      .send({ position: { lat: 46.0667, lng: 11.1217 } });

    expect(checkInRes.status).toBe(201);
    expect(checkInRes.body.pointsAwarded).toBe(50);
    expect(checkInRes.body.totalPoints).toBe(50);

    // Verifica il campo gamification nella response
    const { gamification } = checkInRes.body;
    expect(gamification).toBeDefined();
    expect(gamification.xpAwarded).toBe(50); // 50 XP base, streak=1, moltiplicatore 1.0
    expect(gamification.streakMultiplier).toBe(1.0);
    expect(gamification.currentStreak).toBe(1);
    expect(gamification.totalXp).toBe(50);
    expect(gamification.levelTitle).toBe('Visitatore');
    expect(gamification.newLevel).toBeNull(); // nessun level up al primo completamento
    expect(gamification.shieldEarned).toBe(false);
    expect(gamification.shieldConsumed).toBe(false);
    expect(gamification.streakBroken).toBe(false);
  });

  it('rejects check-in when player is too far from the quest', async () => {
    const admin = await createTestAdmin({ email: 'far-admin@test.com' });
    const player = await createTestPlayer({
      email: 'far-player@test.com',
      username: 'farplayer',
    });
    const adminToken = await getTokenFor(admin);
    const playerToken = await getTokenFor(player);

    const createRes = await request(app)
      .post('/api/v1/admin/quests')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        type: 'secondary',
        name: 'Far Quest',
        description: 'Quest lontana',
        basePoints: 50,
        position: { lat: 46.0667, lng: 11.1217 },
        checkInRadiusMeters: 5,
      });
    const questId = createRes.body.id as string;

    await request(app)
      .post(`/api/v1/admin/quests/${questId}/activate`)
      .set('Authorization', `Bearer ${adminToken}`);

    // Il giocatore è a Roma, la quest è a Trento (~475 km)
    const checkInRes = await request(app)
      .post(`/api/v1/quests/${questId}/check-in`)
      .set('Authorization', `Bearer ${playerToken}`)
      .send({ position: { lat: 41.9028, lng: 12.4964 } });

    expect(checkInRes.status).toBe(409);
    expect(checkInRes.body.code).toBe('OUT_OF_CHECK_IN_RADIUS');
  });

  it('returns 401 for requests without authentication', async () => {
    const res = await request(app).get('/api/v1/quests').send();

    expect(res.status).toBe(401);
  });
});
