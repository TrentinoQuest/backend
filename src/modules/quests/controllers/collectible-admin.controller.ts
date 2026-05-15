import { Request, Response, NextFunction } from 'express';
import type { Collectible } from '@trentino-quest/shared-types';
import { listAllCollectibles } from '../repositories/collectible.repository';
import { ICollectible } from '../../../database/models/Collectible.model';

/**
 * Serializza un collezionabile per la response HTTP.
 */
function serializeCollectible(collectible: ICollectible): Collectible {
  return {
    id: String(collectible._id),
    name: collectible.name,
    description: collectible.description,
    imageUrl: collectible.imageUrl,
    rarity: collectible.rarity,
    createdAt: collectible.createdAt.toISOString(),
  };
}

/**
 * Handler per GET /admin/collectibles.
 *
 * Restituisce la lista completa dei collezionabili. Usato dal backoffice
 * per popolare il dropdown nella schermata di creazione/modifica di una
 * quest principale, dove l'admin deve associare un collezionabile.
 */
export async function listAdminCollectiblesHandler(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const collectibles = await listAllCollectibles();
    res.status(200).json(collectibles.map(serializeCollectible));
  } catch (err) {
    next(err);
  }
}
