import { describe, it, expect } from 'vitest';
import { BusinessApprovalStatus, BusinessType } from '@trentino-quest/shared-types';
import {
  registerBusiness,
  createOwnOffer,
  approveBusiness,
  rejectBusiness,
  updateOwnOffer,
  archiveOwnOffer,
} from '../../src/modules/business/services/business.service';
import { createTestBusiness, createTestPlayer } from '../fixtures';

// ── registerBusiness ───────────────────────────────────────────────────────

describe('registerBusiness', () => {
  it('registers a new business in PENDING state', async () => {
    const result = await registerBusiness({
      email: 'biz@test.com',
      password: 'bizpass123',
      businessName: 'Trattoria Test',
      businessType: BusinessType.RESTAURANT,
      address: 'Via Roma 1',
      position: { lat: 46.0667, lng: 11.1217 },
    });

    expect(result.user.email).toBe('biz@test.com');
    expect((result.user as { approvalStatus?: string }).approvalStatus).toBe(
      BusinessApprovalStatus.PENDING,
    );
    expect(result.accessToken).toBeTruthy();
  });

  it('rejects registration with an already-used email', async () => {
    await createTestPlayer({ email: 'taken@test.com' });

    await expect(
      registerBusiness({
        email: 'taken@test.com',
        password: 'bizpass123',
        businessName: 'Altro Bar',
        businessType: BusinessType.OTHER,
        address: 'Via Verdi 2',
        position: { lat: 46.0, lng: 11.0 },
      }),
    ).rejects.toMatchObject({ code: 'EMAIL_ALREADY_USED' });
  });
});

// ── approveBusiness / rejectBusiness ───────────────────────────────────────

describe('approveBusiness', () => {
  it('sets approvalStatus to APPROVED', async () => {
    const business = await createTestBusiness();

    const approved = await approveBusiness(String(business._id));

    expect(approved.approvalStatus).toBe(BusinessApprovalStatus.APPROVED);
  });

  it('rejects double approval with BUSINESS_ALREADY_APPROVED', async () => {
    const business = await createTestBusiness({ approvalStatus: BusinessApprovalStatus.APPROVED });

    await expect(approveBusiness(String(business._id))).rejects.toMatchObject({
      code: 'BUSINESS_ALREADY_APPROVED',
    });
  });

  it('throws not found for a non-existent business', async () => {
    await expect(approveBusiness('507f1f77bcf86cd799439011')).rejects.toMatchObject({
      code: 'BUSINESS_NOT_FOUND',
    });
  });
});

describe('rejectBusiness', () => {
  it('sets approvalStatus to REJECTED', async () => {
    const business = await createTestBusiness();

    const rejected = await rejectBusiness(String(business._id));

    expect(rejected.approvalStatus).toBe(BusinessApprovalStatus.REJECTED);
  });

  it('throws not found for a non-existent business', async () => {
    await expect(rejectBusiness('507f1f77bcf86cd799439011')).rejects.toMatchObject({
      code: 'BUSINESS_NOT_FOUND',
    });
  });
});

// ── createOwnOffer ─────────────────────────────────────────────────────────

describe('createOwnOffer', () => {
  it('allows an approved business to create an offer', async () => {
    const business = await createTestBusiness({ approvalStatus: BusinessApprovalStatus.APPROVED });

    const offer = await createOwnOffer(String(business._id), {
      title: '10% di sconto',
      description: 'Sconto su tutti i prodotti',
      pointsCost: 50,
    });

    expect(offer.title).toBe('10% di sconto');
    expect(String(offer.businessId)).toBe(String(business._id));
  });

  it('blocks a pending business from creating offers', async () => {
    const business = await createTestBusiness();

    await expect(
      createOwnOffer(String(business._id), {
        title: 'Offerta bloccata',
        description: 'Non deve funzionare',
        pointsCost: 30,
      }),
    ).rejects.toMatchObject({ code: 'BUSINESS_NOT_APPROVED' });
  });

  it('throws not found for a non-existent business', async () => {
    await expect(
      createOwnOffer('507f1f77bcf86cd799439011', {
        title: 'Offerta',
        description: 'Desc',
        pointsCost: 10,
      }),
    ).rejects.toMatchObject({ code: 'BUSINESS_NOT_FOUND' });
  });
});

// ── updateOwnOffer / archiveOwnOffer ───────────────────────────────────────

describe('updateOwnOffer', () => {
  it('allows an owner to update their own offer', async () => {
    const business = await createTestBusiness({ approvalStatus: BusinessApprovalStatus.APPROVED });
    const offer = await createOwnOffer(String(business._id), {
      title: 'Originale',
      description: 'Desc',
      pointsCost: 20,
    });

    const updated = await updateOwnOffer(String(business._id), String(offer._id), {
      title: 'Aggiornata',
    });

    expect(updated.title).toBe('Aggiornata');
  });

  it('blocks a business from updating another business offer', async () => {
    const owner = await createTestBusiness({
      email: 'owner@test.com',
      approvalStatus: BusinessApprovalStatus.APPROVED,
    });
    const other = await createTestBusiness({
      email: 'other@test.com',
      approvalStatus: BusinessApprovalStatus.APPROVED,
    });

    const offer = await createOwnOffer(String(owner._id), {
      title: 'Offerta di owner',
      description: 'Desc',
      pointsCost: 10,
    });

    await expect(
      updateOwnOffer(String(other._id), String(offer._id), { title: 'Hacked' }),
    ).rejects.toMatchObject({ code: 'OFFER_NOT_OWNED' });
  });
});

describe('archiveOwnOffer', () => {
  it('allows an owner to archive their own offer', async () => {
    const business = await createTestBusiness({ approvalStatus: BusinessApprovalStatus.APPROVED });
    const offer = await createOwnOffer(String(business._id), {
      title: 'Da archiviare',
      description: 'Desc',
      pointsCost: 5,
    });

    await expect(archiveOwnOffer(String(business._id), String(offer._id))).resolves.toBeUndefined();
  });

  it('blocks a business from archiving another business offer', async () => {
    const owner = await createTestBusiness({
      email: 'archowner@test.com',
      approvalStatus: BusinessApprovalStatus.APPROVED,
    });
    const other = await createTestBusiness({
      email: 'archother@test.com',
      approvalStatus: BusinessApprovalStatus.APPROVED,
    });

    const offer = await createOwnOffer(String(owner._id), {
      title: 'Offerta protetta',
      description: 'Desc',
      pointsCost: 10,
    });

    await expect(archiveOwnOffer(String(other._id), String(offer._id))).rejects.toMatchObject({
      code: 'OFFER_NOT_OWNED',
    });
  });
});
