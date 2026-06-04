import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app';
import { createTestAdmin } from '../fixtures';
import { issueTokenPair } from '../../src/modules/auth/services/auth.service';
import { BusinessType } from '@trentino-quest/shared-types';

const BASE = '/api/v1';

async function getAdminToken(): Promise<string> {
  const admin = await createTestAdmin({ email: `admin-${Date.now()}@test.com` });
  const pair = await issueTokenPair(admin);
  return pair.accessToken;
}

describe('Business registration → approval → offer creation', () => {
  it('completes the full business affiliate lifecycle', async () => {
    const adminToken = await getAdminToken();

    // 1. Registrazione dell'attività
    const regRes = await request(app)
      .post(`${BASE}/business/register`)
      .send({
        email: 'trattoria@test.com',
        password: 'bizpass1',
        businessName: 'Trattoria da Mario',
        businessType: BusinessType.RESTAURANT,
        address: 'Via Roma 1, Trento',
        position: { lat: 46.0667, lng: 11.1217 },
      });

    expect(regRes.status).toBe(201);
    expect(regRes.body.user.approvalStatus).toBe('pending');
    const bizToken = regRes.body.accessToken as string;
    const bizId = regRes.body.user.id as string;

    // 2. L'attività pending non può creare offerte (403 BUSINESS_NOT_APPROVED)
    const blockedOfferRes = await request(app)
      .post(`${BASE}/business/offers`)
      .set('Authorization', `Bearer ${bizToken}`)
      .send({ title: 'Offerta bloccata', description: 'Non deve funzionare', pointsCost: 30 });

    expect(blockedOfferRes.status).toBe(403);
    expect(blockedOfferRes.body.code).toBe('BUSINESS_NOT_APPROVED');

    // 3. Admin approva l'attività
    const approveRes = await request(app)
      .post(`${BASE}/admin/businesses/${bizId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(approveRes.status).toBe(200);
    expect(approveRes.body.approvalStatus).toBe('approved');

    // 4. Ora l'attività può creare un'offerta (201)
    const offerRes = await request(app)
      .post(`${BASE}/business/offers`)
      .set('Authorization', `Bearer ${bizToken}`)
      .send({
        title: '10% di sconto',
        description: 'Sconto su tutti i piatti del menu',
        pointsCost: 50,
      });

    expect(offerRes.status).toBe(201);
    expect(offerRes.body.title).toBe('10% di sconto');
    expect(offerRes.body.pointsCost).toBe(50);
  });

  it('returns 409 EMAIL_ALREADY_USED for duplicate business email', async () => {
    await request(app)
      .post(`${BASE}/business/register`)
      .send({
        email: 'dup-biz@test.com',
        password: 'bizpass1',
        businessName: 'Bar A',
        businessType: BusinessType.OTHER,
        address: 'Via A 1',
        position: { lat: 46.0, lng: 11.0 },
      });

    const res = await request(app)
      .post(`${BASE}/business/register`)
      .send({
        email: 'dup-biz@test.com',
        password: 'bizpass2',
        businessName: 'Bar B',
        businessType: BusinessType.OTHER,
        address: 'Via B 2',
        position: { lat: 46.0, lng: 11.0 },
      });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('EMAIL_ALREADY_USED');
  });

  it('blocks double approval with 409 BUSINESS_ALREADY_APPROVED', async () => {
    const adminToken = await getAdminToken();

    const regRes = await request(app)
      .post(`${BASE}/business/register`)
      .send({
        email: `double-approve-${Date.now()}@test.com`,
        password: 'bizpass1',
        businessName: 'Test Shop',
        businessType: BusinessType.OTHER,
        address: 'Via Test 1',
        position: { lat: 46.0, lng: 11.0 },
      });
    const bizId = regRes.body.user.id as string;

    await request(app)
      .post(`${BASE}/admin/businesses/${bizId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`);

    const res = await request(app)
      .post(`${BASE}/admin/businesses/${bizId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('BUSINESS_ALREADY_APPROVED');
  });

  it('public offers list includes offers from approved businesses', async () => {
    const adminToken = await getAdminToken();
    const adminUser = await createTestAdmin({ email: 'viewer-admin@test.com' });
    const viewerToken = (await issueTokenPair(adminUser)).accessToken;

    // Crea e approva un'attività, poi crea un'offerta
    const regRes = await request(app)
      .post(`${BASE}/business/register`)
      .send({
        email: 'public-biz@test.com',
        password: 'bizpass1',
        businessName: 'Pizzeria Pubblica',
        businessType: BusinessType.RESTAURANT,
        address: 'Via Pubblica 1',
        position: { lat: 46.0, lng: 11.0 },
      });
    const bizId = regRes.body.user.id as string;
    const bizToken = regRes.body.accessToken as string;

    await request(app)
      .post(`${BASE}/admin/businesses/${bizId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`);

    await request(app)
      .post(`${BASE}/business/offers`)
      .set('Authorization', `Bearer ${bizToken}`)
      .send({ title: 'Pizza gratis', description: 'Per i clienti fedeli', pointsCost: 100 });

    // La lista pubblica deve includere l'offerta (response: array di OfferWithBusiness)
    const offersRes = await request(app)
      .get(`${BASE}/offers`)
      .set('Authorization', `Bearer ${viewerToken}`);

    expect(offersRes.status).toBe(200);
    const offerTitles = (offersRes.body as Array<{ title: string }>).map((o) => o.title);
    expect(offerTitles).toContain('Pizza gratis');
  });
});
