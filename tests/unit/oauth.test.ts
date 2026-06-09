import { describe, it, expect } from 'vitest';
import * as jwt from 'jsonwebtoken';
import type { Request, NextFunction } from 'express';
import { Player } from '../../src/database/models/User.model';

// Abilita il bypass della verifica token per i test
process.env.SKIP_OAUTH_VERIFICATION = 'true';

type OAuthHandler = (req: Request, res: FakeResponse, next: NextFunction) => Promise<void>;

// Importa dopo aver settato la variabile d'ambiente
const { googleOAuthHandler, appleOAuthHandler } =
  (await import('../../src/modules/auth/controllers/oauth.controller')) as {
    googleOAuthHandler: OAuthHandler;
    appleOAuthHandler: OAuthHandler;
  };
const { registerPlayer } = (await import('../../src/modules/auth/services/auth.service')) as {
  registerPlayer: (input: {
    email: string;
    password: string;
    username: string;
  }) => Promise<unknown>;
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

  it('non espone oauthId nella response', async () => {
    const idToken = makeFakeGoogleToken(email, sub);
    const res = makeResponse();

    await googleOAuthHandler(makeRequest({ idToken }), res, makeNext());

    const body = res.body as Record<string, unknown>;
    const user = body.user as Record<string, unknown>;
    expect(user).not.toHaveProperty('oauthId');
  });
});

describe('OAuth — conflitti email e riutilizzo account', () => {
  it("restituisce 409 EMAIL_ALREADY_USED se l'email appartiene a un account password", async () => {
    const email = `local-${Date.now()}@example.com`;
    await registerPlayer({ email, password: 'Password123', username: `local${Date.now()}` });

    const idToken = makeFakeGoogleToken(email, 'google-sub-conflict');
    await expect(
      googleOAuthHandler(makeRequest({ idToken }), makeResponse(), makeNext()),
    ).rejects.toMatchObject({ code: 'EMAIL_ALREADY_USED' });
  });

  it('riusa lo stesso player su due login consecutivi con lo stesso sub', async () => {
    const email = `reuse-${Date.now()}@example.com`;
    const sub = 'google-sub-reuse';
    const idToken = makeFakeGoogleToken(email, sub);

    await googleOAuthHandler(makeRequest({ idToken }), makeResponse(), makeNext());
    await googleOAuthHandler(makeRequest({ idToken }), makeResponse(), makeNext());

    const players = await Player.find({ oauthProvider: 'google', oauthId: sub });
    expect(players).toHaveLength(1);
  });

  it('genera uno username valido anche con parte locale email non alfanumerica', async () => {
    const email = `--.--@example.com`;
    const idToken = makeFakeGoogleToken(email, 'google-sub-weird');
    const res = makeResponse();

    await googleOAuthHandler(makeRequest({ idToken }), res, makeNext());

    expect(res.statusCode).toBe(200);
    const user = (res.body as Record<string, unknown>).user as Record<string, unknown>;
    expect(String(user.username).length).toBeGreaterThanOrEqual(3);
  });
});

describe('OAuth Apple (SKIP_OAUTH_VERIFICATION=true)', () => {
  it('crea un nuovo player Apple con nome e cognome', async () => {
    const email = `apple-${Date.now()}@example.com`;
    const idToken = jwt.sign({ email, sub: 'apple-sub-1' }, 'test-secret');
    const res = makeResponse();

    await appleOAuthHandler(
      makeRequest({ idToken, firstName: 'Mario', lastName: 'Rossi' }),
      res,
      makeNext(),
    );

    expect(res.statusCode).toBe(200);
    const user = (res.body as Record<string, unknown>).user as Record<string, unknown>;
    expect(user.oauthProvider).toBe('apple');
    expect(user).not.toHaveProperty('oauthId');
  });
});
