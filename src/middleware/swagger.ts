import { Router } from 'express';
import swaggerUi from 'swagger-ui-express';
import { loadOpenApiSpec } from '../config/openapi';

/**
 * Crea il router che espone la documentazione OpenAPI dell'API.
 *
 * Monta due endpoint:
 * - GET /docs: Swagger UI navigabile nel browser.
 * - GET /docs/openapi.json: spec OpenAPI in formato JSON, utilizzabile
 *   da tool esterni (Postman, Insomnia, generatori di client).
 *
 * La spec viene caricata una sola volta alla creazione del router.
 */
export function createSwaggerRouter(): Router {
  const router = Router();
  const spec = loadOpenApiSpec();

  router.get('/docs/openapi.json', (_req, res) => {
    res.json(spec);
  });

  router.use('/docs', swaggerUi.serve, swaggerUi.setup(spec));

  return router;
}
