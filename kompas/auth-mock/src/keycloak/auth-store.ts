import { randomUUID } from 'node:crypto';
import type { MockUser } from '../domain/seed.js';

export interface AuthCodeRecord {
  clientId: string;
  redirectUri: string;
  codeChallenge: string | null;
  codeChallengeMethod: 'S256' | 'plain' | null;
  user: MockUser;
  nonce: string | null;
  expiresAt: number;
}

interface RefreshRecord {
  user: MockUser;
  expiresAt: number;
}

interface SsoSession {
  user: MockUser;
  expiresAt: number;
}

const CODE_TTL_MS = 60_000;

/** Короткоживущие коды и refresh-токены. Только память. */
export class AuthStore {
  private readonly codes = new Map<string, AuthCodeRecord>();
  private readonly refreshTokens = new Map<string, RefreshRecord>();
  // SSO-сессии: после входа через форму браузер получает cookie kc_session=<sid>,
  // и повторные /auth других клиентов проходят без формы (единый вход).
  private readonly ssoSessions = new Map<string, SsoSession>();

  /** Создаёт SSO-сессию, возвращает её id (значение cookie). */
  createSsoSession(user: MockUser, ttlSeconds: number): string {
    const sid = randomUUID();
    this.ssoSessions.set(sid, { user, expiresAt: Date.now() + ttlSeconds * 1000 });
    return sid;
  }

  /** Пользователь активной SSO-сессии по её id, либо null. */
  getSsoSession(sid: string | null | undefined): MockUser | null {
    if (!sid) return null;
    const record = this.ssoSessions.get(sid);
    if (!record) return null;
    if (record.expiresAt < Date.now()) {
      this.ssoSessions.delete(sid);
      return null;
    }
    return record.user;
  }

  deleteSsoSession(sid: string | null | undefined): void {
    if (sid) this.ssoSessions.delete(sid);
  }

  issueCode(record: Omit<AuthCodeRecord, 'expiresAt'>): string {
    const code = randomUUID();
    this.codes.set(code, { ...record, expiresAt: Date.now() + CODE_TTL_MS });
    return code;
  }

  consumeCode(code: string): AuthCodeRecord | null {
    const record = this.codes.get(code);
    this.codes.delete(code);
    if (!record || record.expiresAt < Date.now()) return null;
    return record;
  }

  issueRefreshToken(user: MockUser, ttlSeconds: number): string {
    const token = randomUUID();
    this.refreshTokens.set(token, { user, expiresAt: Date.now() + ttlSeconds * 1000 });
    return token;
  }

  /** Refresh-токен одноразовый: при обмене выдаётся новый. */
  rotateRefreshToken(token: string, ttlSeconds: number): { user: MockUser; refreshToken: string } | null {
    const record = this.refreshTokens.get(token);
    this.refreshTokens.delete(token);
    if (!record || record.expiresAt < Date.now()) return null;
    return { user: record.user, refreshToken: this.issueRefreshToken(record.user, ttlSeconds) };
  }

  revokeRefreshToken(token: string): void {
    this.refreshTokens.delete(token);
  }
}
