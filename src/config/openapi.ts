import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { logger } from './logger';

/**
 * Carica e parse il file OpenAPI YAML dal filesystem.
 *
 * Il file viene letto una sola volta all'avvio dell'applicazione e tenuto
 * in memoria. Eventuali modifiche al file YAML richiedono un restart del
 * server per essere riflesse in Swagger UI.
 */
export function loadOpenApiSpec(): Record<string, unknown> {
  const specPath = join(process.cwd(), 'docs', 'openapi.yaml');

  try {
    const fileContent = readFileSync(specPath, 'utf8');
    const spec = parse(fileContent) as Record<string, unknown>;
    logger.info(`OpenAPI spec caricata da ${specPath}`);
    return spec;
  } catch (err) {
    logger.error({ err, specPath }, 'Impossibile caricare OpenAPI spec');
    throw err;
  }
}
