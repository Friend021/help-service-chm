import { randomUUID } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import type { Env } from '../config.js';
import type { MockUser } from '../domain/seed.js';
import type { SigningKeys } from './keys.js';

export interface AuthPrincipal {
  sub: string;
  name: string;
  username: string;
  email: string;
  roles: string[];
  token: string;
}

export function issuer(env: Env): string {
  return `${env.publicUrl}/realms/${env.realm}`;
}

function baseClaims(env: Env, user: MockUser, sid: string) {
  return {
    iss: issuer(env),
    aud: env.clientId,
    azp: env.clientId,
    sub: user.sub,
    sid,
    typ: 'Bearer',
    scope: 'openid profile email',
    preferred_username: user.username,
    name: user.name,
    email: user.email,
    email_verified: true,
    realm_access: { roles: user.roles },
    resource_access: { [env.clientId]: { roles: user.roles } },
  };
}

export async function signAccessToken(
  keys: SigningKeys,
  env: Env,
  user: MockUser,
  sid: string,
): Promise<{ token: string; expiresIn: number }> {
  const now = Math.floor(Date.now() / 1000);
  const token = await new SignJWT(baseClaims(env, user, sid))
    .setProtectedHeader({ alg: keys.alg, kid: keys.kid, typ: 'JWT' })
    .setIssuedAt(now)
    .setExpirationTime(now + env.accessTokenTtlSeconds)
    .setJti(randomUUID())
    .sign(keys.privateKey);

  return { token, expiresIn: env.accessTokenTtlSeconds };
}

export async function signIdToken(
  keys: SigningKeys,
  env: Env,
  user: MockUser,
  sid: string,
  nonce: string | null,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    ...baseClaims(env, user, sid),
    typ: 'ID',
    auth_time: now,
    ...(nonce ? { nonce } : {}),
  };

  return new SignJWT(claims)
    .setProtectedHeader({ alg: keys.alg, kid: keys.kid, typ: 'JWT' })
    .setIssuedAt(now)
    .setExpirationTime(now + env.accessTokenTtlSeconds)
    .sign(keys.privateKey);
}

/**
 * Refresh-токен как подписанный JWT — иначе keycloak-js не может его декодировать
 * (он парсит refresh_token как JWT) и падает с «payload not found». В payload кладём
 * jti, по которому auth-store валидирует/ротатит токен.
 */
export async function signRefreshToken(
  keys: SigningKeys,
  env: Env,
  user: MockUser,
  sid: string,
  jti: string,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    iss: issuer(env),
    aud: issuer(env),
    azp: env.clientId,
    sub: user.sub,
    sid,
    typ: 'Refresh',
    scope: 'openid profile email',
  };
  return new SignJWT(claims)
    .setProtectedHeader({ alg: keys.alg, kid: keys.kid, typ: 'JWT' })
    .setIssuedAt(now)
    .setExpirationTime(now + env.refreshTokenTtlSeconds)
    .setJti(jti)
    .sign(keys.privateKey);
}

/** Проверяет подпись/issuer/срок refresh-JWT и возвращает его jti (ключ в auth-store). */
export async function readRefreshToken(keys: SigningKeys, env: Env, token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, keys.publicKey, {
      issuer: issuer(env),
      algorithms: ['RS256'],
      clockTolerance: 5,
    });
    if (payload.typ !== 'Refresh' || !payload.jti) return null;
    return String(payload.jti);
  } catch {
    return null;
  }
}

/** Проверка подписи, issuer, audience и срока действия. */
export async function verifyAccessToken(keys: SigningKeys, env: Env, token: string): Promise<AuthPrincipal> {
  const { payload } = await jwtVerify(token, keys.publicKey, {
    issuer: issuer(env),
    audience: env.clientId,
    algorithms: ['RS256'],
    clockTolerance: 5,
  });

  const roles = (payload.realm_access as { roles?: string[] } | undefined)?.roles ?? [];

  return {
    sub: String(payload.sub ?? ''),
    name: String(payload.name ?? payload.preferred_username ?? 'Сотрудник'),
    username: String(payload.preferred_username ?? ''),
    email: String(payload.email ?? ''),
    roles,
    token,
  };
}
