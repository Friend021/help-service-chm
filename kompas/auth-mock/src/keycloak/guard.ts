import type { FastifyReply, FastifyRequest, preHandlerHookHandler } from 'fastify';
import type { Env } from '../config.js';
import { MOCK_USERS } from '../domain/seed.js';
import type { SigningKeys } from './keys.js';
import { verifyAccessToken, type AuthPrincipal } from './tokens.js';

declare module 'fastify' {
  interface FastifyRequest {
    auth: AuthPrincipal | null;
  }
}

const DEMO_PRINCIPAL: Omit<AuthPrincipal, 'token'> = {
  sub: MOCK_USERS[0]!.sub,
  name: MOCK_USERS[0]!.name,
  username: MOCK_USERS[0]!.username,
  email: MOCK_USERS[0]!.email,
  roles: MOCK_USERS[0]!.roles,
};

function unauthorized(reply: FastifyReply, message: string): FastifyReply {
  return reply
    .code(401)
    .header('WWW-Authenticate', 'Bearer realm="compass", error="invalid_token"')
    .send({ error: 'unauthorized', error_description: message });
}

/**
 * Проверка Bearer-токена на каждом /api/v1 и /mock запросе.
 * REQUIRE_AUTH=false оставлен для отладки и юнит-тестов без Keycloak.
 */
export function createAuthGuard(env: Env, keys: SigningKeys): preHandlerHookHandler {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!env.requireAuth) {
      request.auth = { ...DEMO_PRINCIPAL, token: 'mock-disabled-auth' };
      return;
    }

    const header = request.headers.authorization;
    if (!header?.toLowerCase().startsWith('bearer ')) {
      await unauthorized(reply, 'Не передан заголовок Authorization: Bearer <token>');
      return;
    }

    const token = header.slice(7).trim();
    if (!token) {
      await unauthorized(reply, 'Пустой Bearer-токен');
      return;
    }

    try {
      request.auth = await verifyAccessToken(keys, env, token);
    } catch {
      await unauthorized(reply, 'Токен недействителен или истёк');
    }
  };
}

export function requirePrincipal(request: FastifyRequest): AuthPrincipal {
  if (!request.auth) {
    throw new Error('requirePrincipal вызван без auth guard');
  }
  return request.auth;
}
