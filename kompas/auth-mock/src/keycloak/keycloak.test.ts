import { createHash, randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authHeader, createTestApp, formBody, getToken } from '../test/helpers.js';

describe('mock Keycloak', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('публикует openid-configuration с issuer мока', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/realms/compass/.well-known/openid-configuration',
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<Record<string, unknown>>();
    expect(body.issuer).toBe('http://localhost:3000/realms/compass');
    expect(body.token_endpoint).toContain('/realms/compass/protocol/openid-connect/token');
    expect(body.code_challenge_methods_supported).toContain('S256');
  });

  it('отдаёт JWKS с RS256 ключом', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/realms/compass/protocol/openid-connect/certs',
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{ keys: Array<Record<string, unknown>> }>();
    expect(body.keys).toHaveLength(1);
    expect(body.keys[0]?.alg).toBe('RS256');
    expect(body.keys[0]?.use).toBe('sig');
  });

  it('выдаёт токен по password grant и принимает его в userinfo', async () => {
    const { accessToken } = await getToken(app);

    const response = await app.inject({
      method: 'GET',
      url: '/realms/compass/protocol/openid-connect/userinfo',
      headers: authHeader(accessToken),
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<Record<string, unknown>>();
    expect(body.sub).toBe('emp-001');
    expect(body.preferred_username).toBe('demo');
  });

  it('отклоняет неверный пароль', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/realms/compass/protocol/openid-connect/token',
      ...formBody({
        grant_type: 'password',
        client_id: 'compass-frontend',
        username: 'demo',
        password: 'wrong',
      }),
    });

    expect(response.statusCode).toBe(400);
    expect(response.json<{ error: string }>().error).toBe('invalid_grant');
  });

  it('блокирует API без Bearer-токена', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/session/context' });
    expect(response.statusCode).toBe(401);
  });

  it('не принимает поддельный токен', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/session/context',
      headers: authHeader('not-a-jwt'),
    });
    expect(response.statusCode).toBe(401);
  });

  it('проходит authorization code flow с PKCE', async () => {
    const verifier = randomUUID();
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    const state = randomUUID();

    const authQuery = new URLSearchParams({
      client_id: 'compass-frontend',
      redirect_uri: 'http://localhost:4200/auth/callback',
      response_type: 'code',
      scope: 'openid profile email',
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
    });

    const login = await app.inject({
      method: 'POST',
      url: `/realms/compass/protocol/openid-connect/auth?${authQuery.toString()}`,
      ...formBody({ username: 'demo', password: 'demo' }),
    });

    expect(login.statusCode).toBe(302);
    const location = new URL(login.headers.location as string);
    expect(location.searchParams.get('state')).toBe(state);
    const code = location.searchParams.get('code');
    expect(code).toBeTruthy();

    const tokenResponse = await app.inject({
      method: 'POST',
      url: '/realms/compass/protocol/openid-connect/token',
      ...formBody({
        grant_type: 'authorization_code',
        client_id: 'compass-frontend',
        code: code as string,
        redirect_uri: 'http://localhost:4200/auth/callback',
        code_verifier: verifier,
      }),
    });

    expect(tokenResponse.statusCode).toBe(200);
    const tokens = tokenResponse.json<{ access_token: string; id_token: string }>();
    expect(tokens.access_token).toBeTruthy();
    expect(tokens.id_token).toBeTruthy();
  });

  it('отклоняет authorization code flow без верного code_verifier', async () => {
    const verifier = randomUUID();
    const challenge = createHash('sha256').update(verifier).digest('base64url');

    const authQuery = new URLSearchParams({
      client_id: 'compass-frontend',
      redirect_uri: 'http://localhost:4200/auth/callback',
      response_type: 'code',
      code_challenge: challenge,
      code_challenge_method: 'S256',
    });

    const login = await app.inject({
      method: 'POST',
      url: `/realms/compass/protocol/openid-connect/auth?${authQuery.toString()}`,
      ...formBody({ username: 'demo', password: 'demo' }),
    });
    const code = new URL(login.headers.location as string).searchParams.get('code') as string;

    const tokenResponse = await app.inject({
      method: 'POST',
      url: '/realms/compass/protocol/openid-connect/token',
      ...formBody({
        grant_type: 'authorization_code',
        client_id: 'compass-frontend',
        code,
        redirect_uri: 'http://localhost:4200/auth/callback',
        code_verifier: 'wrong-verifier',
      }),
    });

    expect(tokenResponse.statusCode).toBe(400);
    expect(tokenResponse.json<{ error_description: string }>().error_description).toContain('PKCE');
  });

  it('ротирует refresh-токен и не принимает старый повторно', async () => {
    const { refreshToken } = await getToken(app);

    const first = await app.inject({
      method: 'POST',
      url: '/realms/compass/protocol/openid-connect/token',
      ...formBody({
        grant_type: 'refresh_token',
        client_id: 'compass-frontend',
        refresh_token: refreshToken,
      }),
    });
    expect(first.statusCode).toBe(200);

    const second = await app.inject({
      method: 'POST',
      url: '/realms/compass/protocol/openid-connect/token',
      ...formBody({
        grant_type: 'refresh_token',
        client_id: 'compass-frontend',
        refresh_token: refreshToken,
      }),
    });
    expect(second.statusCode).toBe(400);
  });

  it('отклоняет redirect_uri вне белого списка', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/realms/compass/protocol/openid-connect/auth?client_id=compass-frontend&redirect_uri=https://evil.example/cb&response_type=code',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json<{ error: string }>().error).toBe('invalid_redirect_uri');
  });
});
