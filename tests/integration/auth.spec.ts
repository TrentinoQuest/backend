import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app';

const BASE = '/api/v1/auth';

describe('POST /api/v1/auth/register', () => {
  it('registers a new player and returns 201 with token pair', async () => {
    const res = await request(app).post(`${BASE}/register`).send({
      email: 'newplayer@test.com',
      password: 'password123',
      username: 'newplayer',
    });

    expect(res.status).toBe(201);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.refreshToken).toMatch(/^rt_/);
    expect(res.body.user.email).toBe('newplayer@test.com');
    expect(res.body.user.role).toBe('player');
    // La password non deve mai essere restituita nella risposta
    expect(res.body.user.password).toBeUndefined();
    // Campi interni al backend: mai esposti via API
    expect(res.body.user.fcmToken).toBeUndefined();
    expect(res.body.user.oauthId).toBeUndefined();
  });

  it('returns 409 with EMAIL_ALREADY_USED for duplicate email', async () => {
    await request(app).post(`${BASE}/register`).send({
      email: 'dup@test.com',
      password: 'password123',
      username: 'firstuser',
    });

    const res = await request(app).post(`${BASE}/register`).send({
      email: 'dup@test.com',
      password: 'password456',
      username: 'seconduser',
    });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('EMAIL_ALREADY_USED');
  });

  it('returns 409 with USERNAME_ALREADY_USED for duplicate username', async () => {
    await request(app).post(`${BASE}/register`).send({
      email: 'first@test.com',
      password: 'password123',
      username: 'samename',
    });

    const res = await request(app).post(`${BASE}/register`).send({
      email: 'second@test.com',
      password: 'password123',
      username: 'samename',
    });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('USERNAME_ALREADY_USED');
  });

  it('returns 400 for invalid payload (missing fields)', async () => {
    const res = await request(app).post(`${BASE}/register`).send({ email: 'nope@test.com' });

    expect(res.status).toBe(400);
  });
});

describe('POST /api/v1/auth/login', () => {
  it('authenticates with valid credentials and returns 200', async () => {
    await request(app).post(`${BASE}/register`).send({
      email: 'logintest@test.com',
      password: 'securepass1',
      username: 'logintestuser',
    });

    const res = await request(app)
      .post(`${BASE}/login`)
      .send({ email: 'logintest@test.com', password: 'securepass1' });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.refreshToken).toMatch(/^rt_/);
  });

  it('returns 401 with INVALID_CREDENTIALS for wrong password', async () => {
    await request(app).post(`${BASE}/register`).send({
      email: 'badpass@test.com',
      password: 'correct1pass',
      username: 'badpassuser',
    });

    const res = await request(app)
      .post(`${BASE}/login`)
      .send({ email: 'badpass@test.com', password: 'wrongpass1' });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_CREDENTIALS');
  });

  it('returns 401 for non-existent email (anti-enumeration)', async () => {
    const res = await request(app)
      .post(`${BASE}/login`)
      .send({ email: 'ghost@test.com', password: 'anything1' });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_CREDENTIALS');
  });
});

describe('POST /api/v1/auth/refresh', () => {
  it('issues a new token pair for a valid refresh token', async () => {
    const reg = await request(app).post(`${BASE}/register`).send({
      email: 'refresh@test.com',
      password: 'passw0rd1',
      username: 'refreshuser',
    });
    const { refreshToken } = reg.body;

    const res = await request(app).post(`${BASE}/refresh`).send({ refreshToken });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.refreshToken).not.toBe(refreshToken);
  });

  it('returns 401 for a reused refresh token (rotation enforced)', async () => {
    const reg = await request(app).post(`${BASE}/register`).send({
      email: 'rotate@test.com',
      password: 'passw0rd1',
      username: 'rotateuser',
    });
    const { refreshToken } = reg.body;

    await request(app).post(`${BASE}/refresh`).send({ refreshToken });

    const res = await request(app).post(`${BASE}/refresh`).send({ refreshToken });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_REFRESH_TOKEN');
  });
});

describe('POST /api/v1/auth/logout', () => {
  it('revokes the refresh token and returns 204', async () => {
    const reg = await request(app).post(`${BASE}/register`).send({
      email: 'logout@test.com',
      password: 'passw0rd1',
      username: 'logoutuser',
    });
    const { refreshToken } = reg.body;

    const res = await request(app).post(`${BASE}/logout`).send({ refreshToken });

    expect(res.status).toBe(204);

    // Il refresh token non deve più funzionare dopo il logout
    const refreshRes = await request(app).post(`${BASE}/refresh`).send({ refreshToken });
    expect(refreshRes.status).toBe(401);
  });
});
