import { TestBed } from '@angular/core/testing';
import { PLATFORM_ID } from '@angular/core';
import { AuthService } from './auth.service';
import { KeycloakTokens, UserProfile } from './models/auth.models';

/**
 * D-4/B4 focused tests for the mock-auth cluster:
 * - #10 concurrent mock refreshes share one in-flight request;
 * - #11 a persisted `kc_tokens` entry restores the session on init (F5),
 *   while expired tokens fall back to the signed-out state.
 */

const nowSec = () => Math.floor(Date.now() / 1000);

function base64Url(value: string): string {
  return btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function jwtWithExp(exp: number): string {
  return `${base64Url('{"alg":"none"}')}.${base64Url(JSON.stringify({ exp }))}.signature`;
}

function makeTokens(exp: number, accessToken?: string): KeycloakTokens {
  return {
    access_token: accessToken ?? jwtWithExp(exp),
    refresh_token: 'refresh-token',
    expires_in: Math.max(0, exp - nowSec()),
    refresh_expires_in: 1800,
    token_type: 'Bearer',
    id_token: 'id-token',
    session_state: 'session',
    scope: 'openid',
  };
}

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as unknown as Response;
}

const profile: UserProfile = {
  sub: 'user-1',
  preferred_username: 'demo',
  email: 'demo@example.com',
  name: 'Demo User',
  roles: ['employee'],
};

describe('AuthService (mock session)', () => {
  let storedTokens: KeycloakTokens;

  beforeEach(() => {
    localStorage.clear();
    storedTokens = makeTokens(nowSec() + 3600);

    TestBed.configureTestingModule({
      providers: [{ provide: PLATFORM_ID, useValue: 'browser' }],
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('dedups two concurrent mock refreshes into a single token request (D-3r #10)', async () => {
    localStorage.setItem('kc_tokens', JSON.stringify(storedTokens));
    const refreshed = makeTokens(nowSec() + 7200, jwtWithExp(nowSec() + 7200));
    let tokenRequests = 0;

    const fetchMock = vi.fn(async (url: string | URL) => {
      if (String(url).includes('/userinfo')) return jsonResponse(profile);
      if (String(url).includes('/protocol/openid-connect/token')) {
        tokenRequests += 1;
        return jsonResponse(refreshed);
      }
      throw new Error(`Unexpected request: ${String(url)}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const auth = TestBed.inject(AuthService);
    await auth.initialize();

    const [first, second] = await Promise.all([auth.refreshToken(), auth.refreshToken()]);

    expect(first).toBe(true);
    expect(second).toBe(true);
    expect(tokenRequests).toBe(1);
    expect(auth.tokens()?.access_token).toBe(refreshed.access_token);
    expect(JSON.parse(localStorage.getItem('kc_tokens')!).access_token).toBe(refreshed.access_token);

    // The in-flight guard is cleared once settled, so a later refresh works.
    await auth.refreshToken();
    expect(tokenRequests).toBe(2);
  });

  it('restores persisted mock tokens on init so F5 keeps the session (D-3r #11)', async () => {
    localStorage.setItem('kc_tokens', JSON.stringify(storedTokens));
    const fetchMock = vi.fn(async (_url: string | URL) => jsonResponse(profile));
    vi.stubGlobal('fetch', fetchMock);

    const auth = TestBed.inject(AuthService);
    await auth.initialize();

    expect(auth.isAuthenticated()).toBe(true);
    expect(auth.loading()).toBe(false);
    expect(auth.tokens()).toEqual(storedTokens);
    expect(auth.user()).toEqual(profile);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain('/userinfo');
  });

  it('does not restore an expired access token (falls back to signed-out)', async () => {
    localStorage.setItem('kc_tokens', JSON.stringify(makeTokens(nowSec() - 60)));
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const auth = TestBed.inject(AuthService);
    await auth.initialize();

    expect(auth.isAuthenticated()).toBe(false);
    expect(auth.tokens()).toBeNull();
    expect(auth.loading()).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not restore when no tokens are persisted', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const auth = TestBed.inject(AuthService);
    await auth.initialize();

    expect(auth.isAuthenticated()).toBe(false);
    expect(auth.loading()).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
