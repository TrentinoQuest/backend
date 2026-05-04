import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../utils/errors';
import { logger } from '../config/logger';
import { error as openApiError } from 'express-openapi-validator';

/**
 * Middleware Express di error handling globale.
 *
 * Cattura tutti gli errori lanciati nei controller e nei service e li mappa
 * a response JSON con un formato consistente:
 *   { code: string, message: string, details?: unknown }
 *
 * Gli errori applicativi (AppError) producono lo status code e il codice
 * dichiarati nell'errore stesso. Gli errori di validazione (ZodError)
 * producono uno status 400 con i dettagli formattati. Tutti gli altri
 * errori vengono loggati e producono uno status 500 con un messaggio
 * generico per evitare di esporre dettagli interni.
 *
 * Va registrato come ultimo middleware in src/server.ts, dopo le routes.
 */
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  if (
    err instanceof openApiError.BadRequest ||
    err instanceof openApiError.Unauthorized ||
    err instanceof openApiError.Forbidden ||
    err instanceof openApiError.NotFound ||
    err instanceof openApiError.MethodNotAllowed ||
    err instanceof openApiError.NotAcceptable ||
    err instanceof openApiError.UnsupportedMediaType ||
    err instanceof openApiError.RequestEntityTooLarge ||
    err instanceof openApiError.InternalServerError
  ) {
    logger.warn({ err, path: req.path }, 'OpenAPI validation error');
    res.status(err.status).json({
      code: 'OPENAPI_VALIDATION_ERROR',
      message: err.message,
      details: err.errors,
    });
    return;
  }

  if (err instanceof AppError) {
    logger.warn({ err, code: err.code }, err.message);
    res.status(err.statusCode).json({
      code: err.code,
      message: err.message,
      details: err.details,
    });
    return;
  }

  if (err instanceof ZodError) {
    logger.warn({ err: err.format() }, 'Validation error');
    res.status(400).json({
      code: 'VALIDATION_ERROR',
      message: 'Input non valido',
      details: err.format(),
    });
    return;
  }

  logger.error({ err }, 'Unhandled error');
  res.status(500).json({
    code: 'INTERNAL_ERROR',
    message: 'Si è verificato un errore interno. Riprova più tardi.',
  });
}
