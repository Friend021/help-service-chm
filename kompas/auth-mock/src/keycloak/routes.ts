import { createHash, randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Env } from '../config.js';
import { findUserByCredentials, type MockUser } from '../domain/seed.js';
import { AuthStore, type AuthCodeRecord } from './auth-store.js';
import type { SigningKeys } from './keys.js';
import { renderLoginPage } from './login-page.js';
import { issuer, readRefreshToken, signAccessToken, signIdToken, signRefreshToken, verifyAccessToken } from './tokens.js';

type FormBody = Record<string, string | undefined>;

interface KeycloakContext {
  env: Env;
  keys: SigningKeys;
  authStore: AuthStore;
}

const AUTH_PATH = 'protocol/openid-connect/auth';

function badRequest(reply: FastifyReply, error: string, description: string): FastifyReply {
  return reply.code(400).send({ error, error_description: description });
}

function redirectUriAllowed(env: Env, redirectUri: string | undefined): boolean {
  if (!redirectUri) return false;
  try {
    const url = new URL(redirectUri);
    return env.allowedRedirectOrigins.some((origin) => {
      try {
        const allowed = new URL(origin);
        return allowed.origin === url.origin;
      } catch {
        return false;
      }
    });
  } catch {
    return false;
  }
}

function verifyPkce(record: AuthCodeRecord, verifier: string | undefined): boolean {
  if (!record.codeChallenge) return true;
  if (!verifier) return false;
  if (record.codeChallengeMethod === 'plain') return verifier === record.codeChallenge;
  const digest = createHash('sha256').update(verifier).digest('base64url');
  return digest === record.codeChallenge;
}

function buildRedirect(redirectUri: string, params: Record<string, string | null>): string {
  const url = new URL(redirectUri);
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== '') url.searchParams.set(key, value);
  }
  return url.toString();
}

/** Имя cookie SSO-сессии и её срок (единый вход между клиентами). */
const SSO_COOKIE = 'KC_SESSION';
const SSO_SESSION_TTL_SECONDS = 8 * 3600;

/** Читает одну cookie из заголовка Cookie. */
function readCookie(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) return part.slice(idx + 1).trim();
  }
  return null;
}

/** Заголовок установки SSO-cookie. SameSite=Lax — уходит при top-level переходах клиентов. */
function ssoCookieHeader(sid: string, ttlSeconds: number): string {
  return `${SSO_COOKIE}=${sid}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${ttlSeconds}`;
}

/** Параметры code_challenge из запроса авторизации. */
function pkceFromParams(params: FormBody): { codeChallenge: string | null; codeChallengeMethod: 'S256' | 'plain' | null } {
  const method = (params.code_challenge_method ?? '').toUpperCase();
  return {
    codeChallenge: params.code_challenge ?? null,
    codeChallengeMethod: method === 'S256' ? 'S256' : method === 'PLAIN' ? 'plain' : null,
  };
}

function tokenPayload(
  env: Env,
  accessToken: string,
  refreshToken: string,
  sid: string,
  idToken?: string,
) {
  return {
    access_token: accessToken,
    expires_in: env.accessTokenTtlSeconds,
    refresh_expires_in: env.refreshTokenTtlSeconds,
    refresh_token: refreshToken,
    token_type: 'Bearer',
    'not-before-policy': 0,
    session_state: sid,
    scope: 'openid profile email',
    ...(idToken ? { id_token: idToken } : {}),
  };
}

async function issueTokensForUser(ctx: KeycloakContext, user: MockUser, nonce: string | null, withIdToken: boolean) {
  const sid = randomUUID();
  const { token } = await signAccessToken(ctx.keys, ctx.env, user, sid);
  // uuid из auth-store используем как jti и упаковываем refresh в JWT (для keycloak-js).
  const jti = ctx.authStore.issueRefreshToken(user, ctx.env.refreshTokenTtlSeconds);
  const refreshToken = await signRefreshToken(ctx.keys, ctx.env, user, sid, jti);
  const idToken = withIdToken ? await signIdToken(ctx.keys, ctx.env, user, sid, nonce) : undefined;
  return tokenPayload(ctx.env, token, refreshToken, sid, idToken);
}

const LOGIN_HIDDEN_FIELDS = [
  'client_id',
  'redirect_uri',
  'response_type',
  'state',
  'nonce',
  'scope',
  'code_challenge',
  'code_challenge_method',
] as const;

export function registerKeycloakRoutes(app: FastifyInstance, ctx: KeycloakContext): void {
  const { env, keys, authStore } = ctx;
  const realmBase = `/realms/${env.realm}`;
  const authPath = `${realmBase}/protocol/openid-connect/auth`;
  const tokenPath = `${realmBase}/protocol/openid-connect/token`;

  app.get(authPath, async (request, reply) => {
    const params = request.query as FormBody;

    const redirectUri = params.redirect_uri ?? '';
    const clientId = params.client_id ?? '';
    if (clientId !== env.clientId) {
      return badRequest(reply, 'invalid_client', `Неизвестный client_id: ${clientId || '(пусто)'}`);
    }
    if (!redirectUriAllowed(env, redirectUri)) {
      return badRequest(reply, 'invalid_redirect_uri', 'redirect_uri не входит в ALLOWED_REDIRECT_ORIGINS');
    }
    if ((params.response_type ?? 'code') !== 'code') {
      return badRequest(reply, 'unsupported_response_type', 'Поддерживается только response_type=code');
    }

    // Единый вход: если у браузера уже есть SSO-сессия на этом Keycloak —
    // выдаём код без формы входа (в т.ч. для prompt=none — тихая авторизация).
    const sessionUser = authStore.getSsoSession(readCookie(request.headers.cookie, SSO_COOKIE));
    if (sessionUser) {
      const { codeChallenge, codeChallengeMethod } = pkceFromParams(params);
      const code = authStore.issueCode({
        clientId,
        redirectUri,
        codeChallenge,
        codeChallengeMethod,
        user: sessionUser,
        nonce: params.nonce ?? null,
      });
      return reply.redirect(buildRedirect(redirectUri, { code, state: params.state ?? null }), 302);
    }

    if (params.prompt === 'none') {
      return reply.redirect(
        buildRedirect(redirectUri, { error: 'login_required', state: params.state ?? null }),
        302,
      );
    }

    const action = `${realmBase}/${AUTH_PATH}?${new URLSearchParams(
      Object.entries(params).filter(([, value]) => typeof value === 'string') as [string, string][],
    ).toString()}`;

    return reply.type('text/html; charset=utf-8').send(
      renderLoginPage({
        action,
        fields: Object.fromEntries(LOGIN_HIDDEN_FIELDS.map((name) => [name, params[name] ?? null])),
      }),
    );
  });

  app.post(authPath, async (request, reply) => {
    const params = request.query as FormBody;
    const body = (request.body ?? {}) as FormBody;

    const redirectUri = params.redirect_uri ?? '';
    const clientId = params.client_id ?? '';
    if (clientId !== env.clientId) {
      return badRequest(reply, 'invalid_client', `Неизвестный client_id: ${clientId || '(пусто)'}`);
    }
    if (!redirectUriAllowed(env, redirectUri)) {
      return badRequest(reply, 'invalid_redirect_uri', 'redirect_uri не входит в ALLOWED_REDIRECT_ORIGINS');
    }

    const action = `${realmBase}/${AUTH_PATH}?${new URLSearchParams(
      Object.entries(params).filter(([, value]) => typeof value === 'string') as [string, string][],
    ).toString()}`;

    const username = (body.username ?? '').trim();
    const password = body.password ?? '';
    const user = findUserByCredentials(username, password);
    if (!user) {
      return reply
        .code(401)
        .type('text/html; charset=utf-8')
        .send(
          renderLoginPage({
            action,
            fields: Object.fromEntries(LOGIN_HIDDEN_FIELDS.map((name) => [name, params[name] ?? null])),
            error: 'Неверный логин или пароль. Используйте demo / demo.',
          }),
        );
    }

    const { codeChallenge, codeChallengeMethod } = pkceFromParams(params);
    const code = authStore.issueCode({
      clientId,
      redirectUri,
      codeChallenge,
      codeChallengeMethod,
      user,
      nonce: params.nonce ?? null,
    });

    // Открываем SSO-сессию: cookie на Keycloak-домене → следующий клиент войдёт тихо.
    const sid = authStore.createSsoSession(user, SSO_SESSION_TTL_SECONDS);
    reply.header('set-cookie', ssoCookieHeader(sid, SSO_SESSION_TTL_SECONDS));

    return reply.redirect(buildRedirect(redirectUri, { code, state: params.state ?? null }), 302);
  });

  app.post(tokenPath, async (request, reply) => {
    const body = (request.body ?? {}) as FormBody;
    const grantType = body.grant_type;

    if (env.clientSecret && body.client_secret !== env.clientSecret) {
      return reply.code(401).send({ error: 'invalid_client', error_description: 'Неверный client_secret' });
    }

    switch (grantType) {
      case 'password': {
        const user = findUserByCredentials(body.username ?? '', body.password ?? '');
        if (!user) {
          return badRequest(reply, 'invalid_grant', 'Неверные учётные данные');
        }
        return reply.send(await issueTokensForUser(ctx, user, body.nonce ?? null, false));
      }

      case 'authorization_code': {
        const record = authStore.consumeCode(body.code ?? '');
        if (!record) {
          return badRequest(reply, 'invalid_grant', 'Код не найден или истёк');
        }
        if (record.clientId !== (body.client_id ?? record.clientId)) {
          return badRequest(reply, 'invalid_grant', 'client_id не совпадает с кодом');
        }
        if (body.redirect_uri && body.redirect_uri !== record.redirectUri) {
          return badRequest(reply, 'invalid_grant', 'redirect_uri не совпадает с кодом');
        }
        if (!verifyPkce(record, body.code_verifier)) {
          return badRequest(reply, 'invalid_grant', 'PKCE: code_verifier не прошёл проверку');
        }
        return reply.send(await issueTokensForUser(ctx, record.user, record.nonce, true));
      }

      case 'refresh_token': {
        // refresh_token теперь JWT: сначала достаём jti, затем ротатим по нему в store.
        const jti = await readRefreshToken(keys, env, body.refresh_token ?? '');
        const rotated = jti ? authStore.rotateRefreshToken(jti, env.refreshTokenTtlSeconds) : null;
        if (!rotated) {
          return badRequest(reply, 'invalid_grant', 'refresh_token недействителен');
        }
        const sid = randomUUID();
        const { token } = await signAccessToken(keys, env, rotated.user, sid);
        const newRefresh = await signRefreshToken(keys, env, rotated.user, sid, rotated.refreshToken);
        return reply.send(tokenPayload(env, token, newRefresh, sid));
      }

      case 'client_credentials': {
        const user: MockUser = {
          username: 'service-account',
          password: '',
          sub: 'service-account-compass',
          name: 'Service Account',
          email: 'service@compass.local',
          roles: ['service'],
        };
        return reply.send(await issueTokensForUser(ctx, user, null, false));
      }

      default:
        return badRequest(reply, 'unsupported_grant_type', `grant_type=${grantType ?? '(пусто)'} не поддерживается`);
    }
  });

  app.get(`${realmBase}/protocol/openid-connect/certs`, async (_request, reply) => {
    return reply.send({ keys: [keys.publicJwk] });
  });

  app.get(`${realmBase}/protocol/openid-connect/userinfo`, async (request: FastifyRequest, reply: FastifyReply) => {
    const header = request.headers.authorization;
    if (!header?.toLowerCase().startsWith('bearer ')) {
      return reply.code(401).header('WWW-Authenticate', 'Bearer').send({ error: 'invalid_token' });
    }
    try {
      const principal = await verifyAccessToken(keys, env, header.slice(7).trim());
      return reply.send({
        sub: principal.sub,
        preferred_username: principal.username,
        name: principal.name,
        email: principal.email,
        email_verified: true,
        realm_access: { roles: principal.roles },
      });
    } catch {
      return reply.code(401).header('WWW-Authenticate', 'Bearer error="invalid_token"').send({ error: 'invalid_token' });
    }
  });

  // Keycloak Account REST API — его дёргает keycloak-js loadUserProfile().
  app.get(`${realmBase}/account`, async (request: FastifyRequest, reply: FastifyReply) => {
    const header = request.headers.authorization;
    if (!header?.toLowerCase().startsWith('bearer ')) {
      return reply.code(401).header('WWW-Authenticate', 'Bearer').send({ error: 'invalid_token' });
    }
    try {
      const principal = await verifyAccessToken(keys, env, header.slice(7).trim());
      const parts = principal.name.trim().split(/\s+/).filter(Boolean);
      return reply.send({
        id: principal.sub,
        username: principal.username,
        firstName: parts[0] ?? principal.name,
        lastName: parts.slice(1).join(' '),
        name: principal.name,
        email: principal.email,
        emailVerified: true,
        attributes: {},
      });
    } catch {
      return reply.code(401).header('WWW-Authenticate', 'Bearer error="invalid_token"').send({ error: 'invalid_token' });
    }
  });

  app.route({
    method: ['GET', 'POST'],
    url: `${realmBase}/protocol/openid-connect/logout`,
    handler: async (request, reply) => {
      const body = (request.body ?? {}) as FormBody;
      const query = request.query as FormBody;
      const refreshToken = body.refresh_token ?? query.refresh_token;
      if (refreshToken) authStore.revokeRefreshToken(refreshToken);

      // Завершаем единый вход: гасим SSO-сессию и cookie.
      authStore.deleteSsoSession(readCookie(request.headers.cookie, SSO_COOKIE));
      reply.header('set-cookie', ssoCookieHeader('', 0));

      const target = body.post_logout_redirect_uri ?? query.post_logout_redirect_uri;
      if (target && redirectUriAllowed(env, target)) {
        return reply.redirect(target, 302);
      }
      return reply.code(204).send();
    },
  });

  app.get(`${realmBase}/.well-known/openid-configuration`, async (_request, reply) => {
    const base = `${env.publicUrl}${realmBase}/protocol/openid-connect`;
    return reply.send({
      issuer: issuer(env),
      authorization_endpoint: `${base}/auth`,
      token_endpoint: `${base}/token`,
      jwks_uri: `${base}/certs`,
      userinfo_endpoint: `${base}/userinfo`,
      end_session_endpoint: `${base}/logout`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token', 'password', 'client_credentials'],
      subject_types_supported: ['public'],
      id_token_signing_alg_values_supported: ['RS256'],
      token_endpoint_auth_methods_supported: ['none', 'client_secret_post'],
      code_challenge_methods_supported: ['S256', 'plain'],
      scopes_supported: ['openid', 'profile', 'email'],
      claims_supported: ['sub', 'preferred_username', 'name', 'email', 'realm_access', 'resource_access'],
    });
  });
}
