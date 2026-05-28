/**
 * Classe base per gli errori applicativi.
 *
 * Estendendo questa classe i moduli possono lanciare errori di dominio
 * con uno status code HTTP e un codice applicativo associati. Il middleware
 * di error handling globale (src/middleware/error-handler.ts) intercetta
 * queste istanze e produce una response JSON consistente.
 */
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class BadRequestError extends AppError {
  constructor(message: string, code = 'BAD_REQUEST', details?: unknown) {
    super(400, code, message, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Autenticazione richiesta', code = 'UNAUTHORIZED') {
    super(401, code, message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Operazione non consentita', code = 'FORBIDDEN') {
    super(403, code, message);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Risorsa non trovata', code = 'NOT_FOUND') {
    super(404, code, message);
  }
}

export class ConflictError extends AppError {
  constructor(message: string, code = 'CONFLICT') {
    super(409, code, message);
  }
}

export type GeoFixRejectionCode = 'OUT_OF_RANGE_ACCURACY' | 'STALE_FIX';

export class GeoFixRejectedError extends AppError {
  constructor(message: string, code: GeoFixRejectionCode, details?: unknown) {
    super(422, code, message, details);
  }
}
