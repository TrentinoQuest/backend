import mongoose from 'mongoose';
import {
  Player,
  Admin,
  Maintenance,
  Business,
  IPlayer,
  IAdmin,
  IMaintenance,
  IBusiness,
} from '../../src/database/models/User.model';
import {
  PrimaryQuest,
  SecondaryQuest,
  IPrimaryQuest,
  ISecondaryQuest,
  PlacementStatus,
  QuestStatus,
} from '../../src/database/models/Quest.model';
import {
  Collectible,
  ICollectible,
  CollectibleRarity,
} from '../../src/database/models/Collectible.model';
import { BusinessType } from '@trentino-quest/shared-types';

export async function createTestPlayer(
  overrides: Partial<{
    email: string;
    password: string;
    username: string;
  }> = {},
): Promise<IPlayer> {
  const data = {
    email: 'player@test.com',
    password: 'password123',
    username: 'testplayer',
    ...overrides,
  };
  return Player.create(data);
}

export async function createTestAdmin(
  overrides: Partial<{
    email: string;
    password: string;
    firstName: string;
    lastName: string;
  }> = {},
): Promise<IAdmin> {
  const data = {
    email: 'admin@test.com',
    password: 'adminpass123',
    firstName: 'Admin',
    lastName: 'Test',
    ...overrides,
  };
  return Admin.create(data);
}

export async function createTestMaintenance(
  overrides: Partial<{
    email: string;
    password: string;
    firstName: string;
    lastName: string;
  }> = {},
): Promise<IMaintenance> {
  const data = {
    email: 'operator@test.com',
    password: 'operatorpass123',
    firstName: 'Operator',
    lastName: 'Test',
    ...overrides,
  };
  return Maintenance.create(data);
}

export async function createTestBusiness(
  overrides: Partial<{
    email: string;
    password: string;
    businessName: string;
    businessType: BusinessType;
    address: string;
    approvalStatus: string;
  }> = {},
): Promise<IBusiness> {
  const { approvalStatus, ...rest } = overrides;
  const data = {
    email: 'business@test.com',
    password: 'bizpass123',
    businessName: 'Test Bar',
    businessType: BusinessType.RESTAURANT,
    address: 'Via Roma 1, Trento',
    position: { type: 'Point' as const, coordinates: [11.1217, 46.0667] as [number, number] },
    ...rest,
  };
  const business = await Business.create(data);
  if (approvalStatus) {
    business.approvalStatus = approvalStatus as IBusiness['approvalStatus'];
    await business.save();
  }
  return business;
}

export async function createTestCollectible(
  overrides: Partial<{
    name: string;
    description: string;
    imageUrl: string;
    rarity: CollectibleRarity;
  }> = {},
): Promise<ICollectible> {
  return Collectible.create({
    name: 'Test Collectible',
    description: 'A test collectible',
    imageUrl: 'https://example.com/img.png',
    rarity: CollectibleRarity.COMMON,
    ...overrides,
  });
}

export async function createTestPrimaryQuest(
  overrides: Partial<{
    name: string;
    description: string;
    basePoints: number;
    status: QuestStatus;
    qrToken: string | null;
    exactPosition: { type: 'Point'; coordinates: [number, number] } | null;
    placementStatus: PlacementStatus;
    collectibleId: mongoose.Types.ObjectId | null;
    searchRadiusMeters: number;
  }> = {},
): Promise<IPrimaryQuest> {
  return PrimaryQuest.create({
    name: 'Primary Test Quest',
    description: 'A primary quest for testing purposes',
    basePoints: 100,
    searchArea: { type: 'Point', coordinates: [11.1217, 46.0667] },
    searchRadiusMeters: 500,
    ...overrides,
  });
}

export async function createTestSecondaryQuest(
  overrides: Partial<{
    name: string;
    description: string;
    basePoints: number;
    status: QuestStatus;
    checkInRadiusMeters: number;
    position: { type: 'Point'; coordinates: [number, number] };
  }> = {},
): Promise<ISecondaryQuest> {
  return SecondaryQuest.create({
    name: 'Secondary Test Quest',
    description: 'A secondary quest for testing purposes',
    basePoints: 50,
    position: { type: 'Point', coordinates: [11.1217, 46.0667] },
    checkInRadiusMeters: 100,
    ...overrides,
  });
}
