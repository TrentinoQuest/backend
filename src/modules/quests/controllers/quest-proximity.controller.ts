import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { ProximityResponse, ProximityZone } from '@trentino-quest/shared-types';
import { Quest, QuestType, QuestStatus } from '../../../database/models/Quest.model';
import { BadRequestError, NotFoundError } from '../../../utils/errors';
import { haversineDistanceMeters, geoJsonToGeoPoint } from '../utils/geo.utils';
import { objectIdParamSchema } from '../validators/quests.validators';

const proximityQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
});

/**
 * Calcola la zona di prossimita' per il feedback "caldo/freddo".
 *
 * IMPORTANTE per la sicurezza: il confine di outside_area e' calcolato
 * rispetto al centro PUBBLICO della searchArea, non alla exactPosition
 * del QR. Se fosse centrato sul QR, un giocatore potrebbe camminare
 * lungo il confine outside_area/cold e triangolare la posizione esatta
 * (il QR sarebbe il centro di quel cerchio).
 *
 * Le zone cold/warm/hot/burning usano la distanza dal QR rapportata al
 * raggio di ricerca, con ratio limitato a 1: un giocatore dentro la
 * searchArea ma piu' lontano del raggio dal QR riceve comunque "cold",
 * mai "outside_area" (come da specifica: fuori area = fuori searchArea).
 */
export function computeProximityZone(
  distanceFromSearchCenterMeters: number,
  distanceFromQrMeters: number,
  radiusMeters: number,
): ProximityZone {
  if (distanceFromSearchCenterMeters > radiusMeters) return 'outside_area';
  const ratio = Math.min(distanceFromQrMeters / radiusMeters, 1);
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
    const params = objectIdParamSchema.parse(req.params);
    const parsed = proximityQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw new BadRequestError('Parametri lat/lng non validi', 'INVALID_COORDINATES');
    }
    const { lat, lng } = parsed.data;

    const quest = await Quest.findOne({ _id: params.id, status: QuestStatus.ACTIVE });
    if (!quest) {
      throw new NotFoundError('Quest non trovata', 'QUEST_NOT_FOUND');
    }

    if (quest.type !== QuestType.PRIMARY) {
      throw new BadRequestError('La quest non è di tipo primary', 'NOT_A_PRIMARY_QUEST');
    }

    const primaryQuest = quest as typeof quest & {
      searchArea: { type: 'Point'; coordinates: [number, number] };
      exactPosition: { type: 'Point'; coordinates: [number, number] } | null;
      searchRadiusMeters: number;
    };

    if (!primaryQuest.exactPosition) {
      const response: ProximityResponse = { zone: 'outside_area' };
      res.json(response);
      return;
    }

    const playerPos = { lat, lng };
    const searchCenter = geoJsonToGeoPoint(primaryQuest.searchArea);
    const exactPos = geoJsonToGeoPoint(primaryQuest.exactPosition);
    const distanceFromSearchCenter = haversineDistanceMeters(playerPos, searchCenter);
    const distanceFromQr = haversineDistanceMeters(playerPos, exactPos);
    const zone = computeProximityZone(
      distanceFromSearchCenter,
      distanceFromQr,
      primaryQuest.searchRadiusMeters,
    );

    const response: ProximityResponse = { zone };
    res.json(response);
  } catch (err) {
    next(err);
  }
}
