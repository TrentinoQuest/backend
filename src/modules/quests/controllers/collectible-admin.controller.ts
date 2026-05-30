import { Request, Response, NextFunction } from 'express';
import type { Collectible } from '@trentino-quest/shared-types';
import {
  listAllCollectibles,
  findCollectibleById,
  createCollectible,
  updateCollectible,
  archiveCollectible,
} from '../repositories/collectible.repository';
import {
  collectibleIdParamSchema,
  createCollectibleSchema,
  updateCollectibleSchema,
} from '../validators/collectible.validators';
import { ICollectible } from '../../../database/models/Collectible.model';
import { NotFoundError } from '../../../utils/errors';

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
    status: collectible.status,
    createdAt: collectible.createdAt.toISOString(),
  };
}

/**
 * Handler per GET /admin/collectibles.
 *
 * Restituisce la lista dei collezionabili attivi. Usato dal backoffice
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

/**
 * Handler per GET /admin/collectibles/:id.
 */
export async function getAdminCollectibleHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const params = collectibleIdParamSchema.parse(req.params);
    const collectible = await findCollectibleById(params.id);
    if (!collectible) {
      throw new NotFoundError('Collezionabile non trovato', 'COLLECTIBLE_NOT_FOUND');
    }
    res.status(200).json(serializeCollectible(collectible));
  } catch (err) {
    next(err);
  }
}

/**
 * Handler per POST /admin/collectibles.
 */
export async function createCollectibleHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const body = createCollectibleSchema.parse(req.body);
    const collectible = await createCollectible(body);
    res.status(201).json(serializeCollectible(collectible));
  } catch (err) {
    next(err);
  }
}

/**
 * Handler per PATCH /admin/collectibles/:id.
 */
export async function updateCollectibleHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const params = collectibleIdParamSchema.parse(req.params);
    const body = updateCollectibleSchema.parse(req.body);
    const collectible = await updateCollectible(params.id, body);
    if (!collectible) {
      throw new NotFoundError('Collezionabile non trovato', 'COLLECTIBLE_NOT_FOUND');
    }
    res.status(200).json(serializeCollectible(collectible));
  } catch (err) {
    next(err);
  }
}

/**
 * Handler per DELETE /admin/collectibles/:id.
 *
 * Soft-delete: il collezionabile viene archiviato (status ARCHIVED), non
 * rimosso, per preservare gli album dei giocatori che lo possiedono.
 */
export async function archiveCollectibleHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const params = collectibleIdParamSchema.parse(req.params);
    const collectible = await archiveCollectible(params.id);
    if (!collectible) {
      throw new NotFoundError('Collezionabile non trovato', 'COLLECTIBLE_NOT_FOUND');
    }
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
