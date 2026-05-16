import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { logger } from './logger';

//Definizione path del file swagger.yaml
export const apiSpecPath = join(process.cwd(), 'swagger.yaml');

/**
 * Carica e parse il file OpenAPI YAML dal filesystem.
 *
 * Il file viene letto una sola volta all'avvio dell'applicazione e tenuto
 * in memoria. Eventuali modifiche al file YAML richiedono un restart del
 * server per essere riflesse in Swagger UI.
 */
export function loadOpenApiSpec(): Record<string, unknown> {
  try {
    const fileContent = readFileSync(apiSpecPath, 'utf8');
    const spec = parse(fileContent) as Record<string, unknown>;
    logger.info(`OpenAPI spec caricata da ${apiSpecPath}`);
    return spec;
  } catch (err) {
    logger.error({ err, apiSpecPath }, 'Impossibile caricare OpenAPI spec');
    throw err;
  }
}
