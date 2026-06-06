import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { ProximityResponse, ProximityZone } from '@trentino-quest/shared-types';
import { Quest, QuestType, QuestStatus } from '../../../database/models/Quest.model';
import { BadRequestError, NotFoundError } from '../../../utils/errors';
import { haversineDistanceMeters, geoJsonToGeoPoint } from '../utils/geo.utils';

const proximityQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
});

export function computeProximityZone(distanceMeters: number, radiusMeters: number): ProximityZone {
  if (distanceMeters > radiusMeters) return 'outside_area';
  const ratio = distanceMeters / radiusMeters;
  if (ratio > 0.6) return 'cold';
  if (ratio > 0.3) return 'warm';
  if (ratio > 0.1) return 'hot';
  return 'burning';
}

export async function proximityHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = proximityQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw new BadRequestError('Parametri lat/lng non validi', 'INVALID_COORDINATES');
    }
    const { lat, lng } = parsed.data;

    const quest = await Quest.findOne({ _id: req.params.id, status: QuestStatus.ACTIVE });
    if (!quest) {
      throw new NotFoundError('Quest non trovata', 'QUEST_NOT_FOUND');
    }

    if (quest.type !== QuestType.PRIMARY) {
      throw new BadRequestError('La quest non è di tipo primary', 'NOT_A_PRIMARY_QUEST');
    }

    const primaryQuest = quest as typeof quest & {
      exactPosition: { type: 'Point'; coordinates: [number, number] } | null;
      searchRadiusMeters: number;
    };

    if (!primaryQuest.exactPosition) {
      const response: ProximityResponse = { zone: 'outside_area' };
      res.json(response);
      return;
    }

    const playerPos = { lat, lng };
    const exactPos = geoJsonToGeoPoint(primaryQuest.exactPosition);
    const distance = haversineDistanceMeters(playerPos, exactPos);
    const zone = computeProximityZone(distance, primaryQuest.searchRadiusMeters);

    const response: ProximityResponse = { zone };
    res.json(response);
  } catch (err) {
    next(err);
  }
}
