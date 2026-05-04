import { join } from 'node:path';
import { middleware as openApiValidator } from 'express-openapi-validator';
import type { RequestHandler } from 'express';

/**
 * Crea il middleware di validazione automatica delle richieste HTTP
 * rispetto alla specifica OpenAPI.
 *
 * Per ogni richiesta in arrivo verso un path documentato nello schema:
 * - valida i parametri della query string e i path parameters
 * - valida il body della richiesta contro lo schema dichiarato
 * - valida la presenza e il formato dell'header Authorization quando
 *   l'endpoint richiede autenticazione
 *
 * Le richieste verso path NON documentati nello schema vengono lasciate
 * passare senza validazione (utile per endpoint infrastrutturali come
 * /health o /api/v1/docs che vivono fuori dal contratto API pubblico).
 *
 * Eventuali violazioni vengono propagate al middleware di error handling
 * globale (src/middleware/error-handler.ts) come errori standard di
 * express-openapi-validator.
 */
export function createOpenApiValidator(): RequestHandler[] {
  const apiSpecPath = join(process.cwd(), 'docs', 'openapi.yaml');

  return openApiValidator({
    apiSpec: apiSpecPath,
    validateRequests: true,
    validateResponses: false,
    ignoreUndocumented: true,
  });
}
