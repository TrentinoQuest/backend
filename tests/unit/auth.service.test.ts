import { describe, it, expect } from 'vitest';
import {
  registerPlayer,
  login,
  refreshTokens,
  logout,
  requestPasswordRecovery,
  resetPassword,
} from '../../src/modules/auth/services/auth.service';

describe('registerPlayer', () => {
  it('creates a player and returns token pair', async () => {
    const result = await registerPlayer({
      email: 'player@test.com',
      password: 'password123',
      username: 'testplayer',
    });

    expect(result.user.email).toBe('player@test.com');
    expect(result.user.username).toBe('testplayer');
    expect(result.accessToken).toBeTruthy();
    expect(result.refreshToken).toMatch(/^rt_/);
  });

  it('rejects registration with a duplicate email', async () => {
    await registerPlayer({
      email: 'dup@test.com',
      password: 'password123',
      username: 'user1',
    });

    await expect(
      registerPlayer({ email: 'dup@test.com', password: 'password456', username: 'user2' }),
    ).rejects.toMatchObject({ code: 'EMAIL_ALREADY_USED' });
  });

  it('rejects registration with a duplicate username', async () => {
    await registerPlayer({
      email: 'first@test.com',
      password: 'password123',
      username: 'sameusername',
    });

    await expect(
      registerPlayer({
        email: 'second@test.com',
        password: 'password123',
        username: 'sameusername',
      }),
    ).rejects.toMatchObject({ code: 'USERNAME_ALREADY_USED' });
  });
});

describe('login', () => {
  it('returns token pair for valid credentials', async () => {
    await registerPlayer({
      email: 'login@test.com',
      password: 'mysecurepass',
      username: 'loginuser',
    });

    const result = await login({ email: 'login@test.com', password: 'mysecurepass' });

    expect(result.user.email).toBe('login@test.com');
    expect(result.accessToken).toBeTruthy();
    expect(result.refreshToken).toMatch(/^rt_/);
  });

  it('rejects login with wrong password', async () => {
    await registerPlayer({
      email: 'badpass@test.com',
      password: 'correctpass',
      username: 'badpassuser',
    });

    await expect(login({ email: 'badpass@test.com', password: 'wrongpass' })).rejects.toMatchObject(
      { code: 'INVALID_CREDENTIALS' },
    );
  });

  it('rejects login for a non-existent email (anti-enumeration: same error code)', async () => {
    await expect(login({ email: 'nobody@test.com', password: 'anything' })).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    });
  });
});

describe('refreshTokens', () => {
  it('returns a new token pair for a valid refresh token', async () => {
    const { refreshToken } = await registerPlayer({
      email: 'refresh@test.com',
      password: 'pass1234',
      username: 'refreshuser',
    });

    const newPair = await refreshTokens(refreshToken);

    expect(newPair.accessToken).toBeTruthy();
    expect(newPair.refreshToken).toMatch(/^rt_/);
    // Il nuovo refresh token deve essere diverso dal vecchio (rotation)
    expect(newPair.refreshToken).not.toBe(refreshToken);
  });

  it('rejects a refresh token that has already been used (rotation)', async () => {
    const { refreshToken } = await registerPlayer({
      email: 'rotation@test.com',
      password: 'pass1234',
      username: 'rotationuser',
    });

    await refreshTokens(refreshToken);

    await expect(refreshTokens(refreshToken)).rejects.toMatchObject({
      code: 'INVALID_REFRESH_TOKEN',
    });
  });

  it('rejects an invalid or random refresh token', async () => {
    await expect(refreshTokens('rt_invalidtoken')).rejects.toMatchObject({
      code: 'INVALID_REFRESH_TOKEN',
    });
  });
});

describe('logout', () => {
  it('revokes the refresh token so it cannot be used again', async () => {
    const { refreshToken } = await registerPlayer({
      email: 'logout@test.com',
      password: 'pass1234',
      username: 'logoutuser',
    });

    await logout(refreshToken);

    await expect(refreshTokens(refreshToken)).rejects.toMatchObject({
      code: 'INVALID_REFRESH_TOKEN',
    });
  });

  it('is idempotent: does not throw if token is already revoked', async () => {
    const { refreshToken } = await registerPlayer({
      email: 'idempotent@test.com',
      password: 'pass1234',
      username: 'idempotentuser',
    });

    await logout(refreshToken);
    await expect(logout(refreshToken)).resolves.toBeUndefined();
  });
});

// ── Password reset ───────────────────────────────────────────────────────────

describe('resetPassword', () => {
  async function setupPlayerWithRecovery(): Promise<{ email: string; token: string }> {
    const email = `reset-${Date.now()}@test.com`;
    await registerPlayer({ email, password: 'OldPassword1', username: `reset${Date.now()}` });
    const token = await requestPasswordRecovery({ email });
    if (!token) throw new Error('token di recovery non generato');
    return { email, token };
  }

  it('cambia la password e permette il login con quella nuova', async () => {
    const { email, token } = await setupPlayerWithRecovery();

    await resetPassword(token, 'NewPassword1');

    const result = await login({ email, password: 'NewPassword1' });
    expect(result.accessToken).toBeTruthy();
  });

  it('rifiuta il login con la vecchia password dopo il reset', async () => {
    const { email, token } = await setupPlayerWithRecovery();

    await resetPassword(token, 'NewPassword1');

    await expect(login({ email, password: 'OldPassword1' })).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    });
  });

  it('il token è monouso: il secondo reset fallisce', async () => {
    const { token } = await setupPlayerWithRecovery();

    await resetPassword(token, 'NewPassword1');

    await expect(resetPassword(token, 'AnotherPass1')).rejects.toMatchObject({
      code: 'INVALID_RESET_TOKEN',
    });
  });

  it('rifiuta un token inesistente', async () => {
    await expect(resetPassword('token-inventato', 'NewPassword1')).rejects.toMatchObject({
      code: 'INVALID_RESET_TOKEN',
    });
  });

  it('revoca i refresh token attivi dopo il reset', async () => {
    const email = `resetrt-${Date.now()}@test.com`;
    const { refreshToken } = await registerPlayer({
      email,
      password: 'OldPassword1',
      username: `resetrt${Date.now()}`,
    });
    const token = await requestPasswordRecovery({ email });
    if (!token) throw new Error('token di recovery non generato');

    await resetPassword(token, 'NewPassword1');

    await expect(refreshTokens(refreshToken)).rejects.toMatchObject({
      code: 'INVALID_REFRESH_TOKEN',
    });
  });

  it('requestPasswordRecovery ritorna null per email non registrata', async () => {
    const token = await requestPasswordRecovery({ email: 'nonesiste@test.com' });
    expect(token).toBeNull();
  });
});
