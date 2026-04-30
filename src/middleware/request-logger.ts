import { Request, Response, NextFunction } from 'express';
import { logger } from '../config/logger';

/**
 * Middleware che logga ogni richiesta HTTP completata.
 *
 * Registra metodo, URL, status code della response e durata in millisecondi.
 * Utile per il debug locale e per il monitoring in produzione.
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info(
      {
        method: req.method,
        url: req.originalUrl,
        status: res.statusCode,
        duration,
      },
      `${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`,
    );
  });

  next();
}
