import { describe, it, expect } from 'vitest';
import * as jwt from 'jsonwebtoken';
import type { Request, NextFunction } from 'express';
import { Player } from '../../src/database/models/User.model';

// Abilita il bypass della verifica token per i test
process.env.SKIP_OAUTH_VERIFICATION = 'true';

type OAuthHandler = (req: Request, res: FakeResponse, next: NextFunction) => Promise<void>;

// Importa dopo aver settato la variabile d'ambiente
const { googleOAuthHandler } =
  (await import('../../src/modules/auth/controllers/oauth.controller')) as {
    googleOAuthHandler: OAuthHandler;
  };

function makeFakeGoogleToken(email: string, sub: string): string {
  return jwt.sign({ email, sub }, 'test-secret');
}

function makeRequest(body: unknown): Request {
  return {
    body,
    headers: { 'user-agent': 'vitest' },
  } as unknown as Request;
}

interface FakeResponse {
  statusCode: number;
  body: unknown;
  status(code: number): this;
  json(body: unknown): void;
}

function makeResponse(): FakeResponse {
  let statusCode = 200;
  let jsonBody: unknown;
  return {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(body: unknown) {
      jsonBody = body;
    },
    get statusCode() {
      return statusCode;
    },
    get body() {
      return jsonBody;
    },
  };
}

function makeNext(): NextFunction {
  return ((err?: unknown) => {
    if (err) {
      throw err instanceof Error ? err : new Error(JSON.stringify(err));
    }
  }) as NextFunction;
}

describe('OAuth Google (SKIP_OAUTH_VERIFICATION=true)', () => {
  const email = `oauth-test-${Date.now()}@example.com`;
  const sub = `google-sub-${Date.now()}`;

  it('crea un nuovo player OAuth e restituisce token', async () => {
    const idToken = makeFakeGoogleToken(email, sub);
    const res = makeResponse();

    await googleOAuthHandler(makeRequest({ idToken }), res, makeNext());

    expect(res.statusCode).toBe(200);
    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty('accessToken');
    expect(body).toHaveProperty('refreshToken');
    expect((body.user as Record<string, unknown>).oauthProvider).toBe('google');
  });

  it('recupera il player esistente alla seconda chiamata con stesso sub', async () => {
    const idToken = makeFakeGoogleToken(email, sub);
    const res = makeResponse();

    await googleOAuthHandler(makeRequest({ idToken }), res, makeNext());

    const players = await Player.find({ oauthProvider: 'google', email });
    expect(players).toHaveLength(1);
  });

  it('non espone oauthId nella response', async () => {
    const idToken = makeFakeGoogleToken(email, sub);
    const res = makeResponse();

    await googleOAuthHandler(makeRequest({ idToken }), res, makeNext());

    const body = res.body as Record<string, unknown>;
    const user = body.user as Record<string, unknown>;
    expect(user).not.toHaveProperty('oauthId');
  });
});
