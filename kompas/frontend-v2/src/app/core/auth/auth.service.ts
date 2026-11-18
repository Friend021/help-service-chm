import { Injectable, signal, computed, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import * as Keycloak from 'keycloak-js';
import { environment } from '../../environments/environment';
import { KeycloakConfig, KeycloakTokens, UserProfile, AuthState } from './models/auth.models';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly platformId = inject(PLATFORM_ID);
  private keycloak: Keycloak.KeycloakInstance | null = null;
  private readonly isBrowser = isPlatformBrowser(this.platformId);
  #initPromise: Promise<void> | null = null;
  #mockLoginUsed = false;
  #refreshInFlight: Promise<boolean> | null = null;
  #mockRefreshInFlight: Promise<boolean> | null = null;

  readonly #state = signal<AuthState>({
    isAuthenticated: false,
    user: null,
    tokens: null,
    loading: true,
    error: null,
  });

  readonly isAuthenticated = computed(() => this.#state().isAuthenticated);
  readonly user = computed(() => this.#state().user);
  readonly tokens = computed(() => this.#state().tokens);
  readonly loading = computed(() => this.#state().loading);
  readonly error = computed(() => this.#state().error);
  readonly accessToken = computed(() => this.#state().tokens?.access_token ?? null);
  readonly initials = computed(() => {
    const name = this.#state().user?.name ?? '';
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length <= 1) return parts[0] ?? '';
    return `${parts[0]} ${parts[1]?.[0] ?? ''}.`;
  });

  initialize(): Promise<void> {
    this.#initPromise ||= this.#initKeycloak();
    return this.#initPromise;
  }

  async #initKeycloak(): Promise<void> {
    try {
      if (!this.isBrowser) {
        this.#state.update(s => ({ ...s, loading: false }));
        return;
      }

      // Mock-login mode (dev): the app authenticates via the password grant and
      // the mock backend exposes no Keycloak iframe endpoints, so kc.init's
      // check-sso probes (3p-cookies / login-status / silent-check-sso) can
      // only stall or hang the boot path. Same gate as the login page
      // (useKeycloak = !environment.mockUsers.length).
      if (environment.mockUsers.length) {
        // Restore a persisted mock session so a browser refresh (F5) keeps the
        // user signed in. The tokens are written by `storeTokens` on login and
        // refresh; the access token expiry is honoured before hydrating.
        const restored = await this.#restoreMockSession();
        if (!restored) this.#state.update(s => ({ ...s, loading: false }));
        return;
      }

      const config: KeycloakConfig = environment.keycloak;

      this.keycloak = new Keycloak.default({
        url: config.url.replace(`/realms/${config.realm}`, ''),
        realm: config.realm,
        clientId: config.clientId,
      });

      // Минимальный mock-Keycloak не поддерживает iframe-механизмы keycloak-js
      // (3p-cookies/step1.html, login-status-iframe, silent check-sso) — они дают
      // 404 и таймаут «3rd party check iframe», роняя init. Поэтому инициализируем
      // чистым redirect-flow: без onLoad/silent-iframe и без login-iframe.
      // На возврате с ?code=... init сам распарсит callback и авторизует.
      const authenticated = await this.keycloak.init({
        pkceMethod: 'S256',
        // mock отдаёт code в query (?code=...), а не во fragment.
        responseMode: 'query',
        checkLoginIframe: false,
      });

      if (authenticated && this.keycloak.token) {
        await this.loadUserProfile();
      } else {
        this.#state.update(s => ({ ...s, loading: false }));
      }

      this.keycloak.onTokenExpired = () => this.refreshToken();
    } catch (error) {
      console.error('Keycloak initialization failed:', error);
      this.#state.update(s => ({ ...s, loading: false, error: 'Auth initialization failed' }));
    }
  }

  /**
   * Resolves exactly once, when keycloak initialization (started by `initialize()`)
   * has finished — success or failure. One-shot: no polling, no busy loops.
   */
  async waitForInit(): Promise<void> {
    this.#initPromise ||= this.#initKeycloak();
    await this.#initPromise;
  }

  /**
   * Async token bridge for raw `fetch` consumers (SSE, etc.).
   * Rejects (never throws synchronously) when no valid token can be provided.
   */
  async getFreshToken(): Promise<string> {
    if (!this.isBrowser) return Promise.reject(new Error('getFreshToken is not available on the server'));

    const kc = this.keycloak;
    if (kc && !this.#mockLoginUsed) {
      return this.#getFreshKeycloakToken(kc);
    }
    return this.#getFreshMockToken();
  }

  async #getFreshKeycloakToken(kc: Keycloak.KeycloakInstance): Promise<string> {
    if (!kc.token) return Promise.reject(new Error('Not authenticated'));

    try {
      // Refresh if the token expires within 10 seconds (shared with other refresh callers).
      await this.#refreshKeycloakToken(10);
    } catch {
      // Refresh failed (e.g. session revoked): force a re-login attempt, then reject cleanly.
      void this.login();
      return Promise.reject(new Error('Session expired'));
    }

    if (!kc.token) return Promise.reject(new Error('Not authenticated'));
    if (kc.token !== this.accessToken()) this.updateTokensFromKeycloak();
    return kc.token;
  }

  async #getFreshMockToken(): Promise<string> {
    const current = this.tokens();
    if (!current?.access_token) return Promise.reject(new Error('Not authenticated'));

    const exp = this.#decodeJwtExpirationEpoch(current.access_token);
    const nowSec = Math.floor(Date.now() / 1000);
    if (exp === null || exp - nowSec >= 10) return current.access_token;

    const refreshed = await this.#refreshMockTokens();
    if (!refreshed || !this.tokens()?.access_token) {
      return Promise.reject(new Error('Session expired'));
    }
    return this.tokens()!.access_token;
  }

  /** Extracts the `exp` claim (unix seconds) from a JWT; null if not parseable. */
  #decodeJwtExpirationEpoch(jwt: string): number | null {
    const payload = jwt.split('.')[1];
    if (!payload) return null;
    try {
      const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as Record<string, unknown>;
      return typeof json['exp'] === 'number' ? json['exp'] : null;
    } catch {
      return null;
    }
  }

  /**
   * @param redirectPath путь (например, '/entry'), на который Keycloak вернёт после
   * входа. По умолчанию — корень. Нужен для перехода из «Плана развития» через /entry.
   */
  async login(redirectPath = ''): Promise<void> {
    if (!this.keycloak || !this.isBrowser) return;

    this.#state.update(s => ({ ...s, loading: true, error: null }));

    try {
      await this.keycloak.login({
        redirectUri: window.location.origin + redirectPath,
      });
    } catch (error) {
      console.error('Login failed:', error);
      this.#state.update(s => ({ ...s, loading: false, error: 'Login failed' }));
    }
  }

  async logout(): Promise<void> {
    if (!this.isBrowser) return;

    if (!this.keycloak) {
      // Mock-session logout: no keycloak instance to redirect through, so clear
      // tokens locally and return to the login page (otherwise logout is a no-op
      // and the session stays alive in localStorage).
      if (this.#mockLoginUsed) {
        this.#mockLoginUsed = false;
        localStorage.removeItem('kc_tokens');
        this.#state.set({
          isAuthenticated: false,
          user: null,
          tokens: null,
          loading: false,
          error: null,
        });
        window.location.assign('/login');
      }
      return;
    }

    try {
      await this.keycloak.logout({ redirectUri: window.location.origin });
      this.#mockLoginUsed = false;
      this.#state.set({
        isAuthenticated: false,
        user: null,
        tokens: null,
        loading: false,
        error: null,
      });
    } catch (error) {
      console.error('Logout failed:', error);
    }
  }

  async refreshToken(): Promise<boolean> {
    const kc = this.keycloak;
    if (kc && !this.#mockLoginUsed) {
      try {
        return await this.#refreshKeycloakToken(30);
      } catch (error) {
        console.error('Token refresh failed:', error);
        await this.logout();
        return false;
      }
    }

    return this.#refreshMockTokens();
  }

  /**
   * Single shared in-flight Keycloak refresh: concurrent callers (getFreshToken,
   * onTokenExpired → refreshToken, interceptor) share one updateToken promise so
   * parallel refreshes cannot rotate/lose the refresh token against each other.
   */
  #refreshKeycloakToken(minValiditySeconds: number): Promise<boolean> {
    this.#refreshInFlight ??= (async () => {
      const kc = this.keycloak!;
      try {
        const refreshed = await kc.updateToken(minValiditySeconds);
        if (refreshed && kc.token) this.updateTokensFromKeycloak();
        return refreshed;
      } finally {
        this.#refreshInFlight = null;
      }
    })();
    return this.#refreshInFlight;
  }

  /**
   * Single shared in-flight mock refresh: concurrent callers (SSE retry,
   * interceptor, onTokenExpired) await the same password-grant refresh so the
   * rotating `refresh_token` cannot be consumed twice.
   */
  #refreshMockTokens(): Promise<boolean> {
    this.#mockRefreshInFlight ??= this.#doRefreshMockTokens().finally(() => {
      this.#mockRefreshInFlight = null;
    });
    return this.#mockRefreshInFlight;
  }

  /** Password-grant refresh via refresh_token. Sets state tokens on success. */
  async #doRefreshMockTokens(): Promise<boolean> {
    if (!environment.mockLoginEnabled) return false;

    const current = this.tokens();
    if (!current?.refresh_token) return false;

    try {
      const response = await fetch(`${environment.keycloak.url}/protocol/openid-connect/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          client_id: environment.keycloak.clientId,
          refresh_token: current.refresh_token,
        }),
      });
      if (!response.ok) return false;

      const tokens = (await response.json()) as KeycloakTokens;
      this.storeTokens(tokens);
      this.#state.update(s => ({ ...s, tokens, isAuthenticated: true }));
      return true;
    } catch (error) {
      console.error('Token refresh failed:', error);
      return false;
    }
  }

  private async loadUserProfile(): Promise<void> {
    if (!this.keycloak?.token) return;

    try {
      await this.keycloak.loadUserProfile();
      const profile = this.keycloak.profile as unknown as UserProfile;

      this.#state.set({
        isAuthenticated: true,
        user: profile,
        tokens: this.extractTokens(),
        loading: false,
        error: null,
      });
    } catch (error) {
      console.error('Failed to load user profile:', error);
      this.#state.update(s => ({ ...s, loading: false, error: 'Failed to load profile' }));
    }
  }

  private extractTokens(): KeycloakTokens {
    const kc = this.keycloak!;
    const tokenParsed = kc.tokenParsed as Record<string, unknown> | undefined;
    const refreshTokenParsed = kc.refreshTokenParsed as Record<string, unknown> | undefined;

    const exp = tokenParsed?.['exp'] as number | undefined;
    const refreshExp = refreshTokenParsed?.['exp'] as number | undefined;
    const scope = tokenParsed?.['scope'] as string | undefined;

    return {
      access_token: kc.token!,
      refresh_token: kc.refreshToken!,
      expires_in: exp ? exp - Math.floor(Date.now() / 1000) : 300,
      refresh_expires_in: refreshExp ? refreshExp - Math.floor(Date.now() / 1000) : 1800,
      token_type: 'Bearer',
      id_token: kc.idToken!,
      session_state: kc.sessionId!,
      scope: scope ?? '',
    };
  }

  private updateTokensFromKeycloak(): void {
    this.#state.update(s => ({ ...s, tokens: this.extractTokens() }));
  }

  async mockLogin(username: string, password: string): Promise<void> {
    if (!this.isBrowser) return;

    if (!environment.mockLoginEnabled) {
      this.#state.update(s => ({ ...s, loading: false, error: 'Мок-вход отключён' }));
      return;
    }

    this.#state.update(s => ({ ...s, loading: true, error: null }));

    try {
      const response = await fetch(`${environment.apiUrl.replace('/api/v1', '')}/realms/compass/protocol/openid-connect/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'password',
          client_id: environment.keycloak.clientId,
          username,
          password,
        }),
      });

      if (!response.ok) throw new Error('Invalid credentials');

      const tokens = await response.json();
      this.#mockLoginUsed = true;
      this.storeTokens(tokens);
      await this.loadUserProfileFromTokens(tokens);
    } catch (error) {
      console.error('Mock login failed:', error);
      this.#state.update(s => ({ ...s, loading: false, error: 'Invalid credentials' }));
    }
  }

  /**
   * Hydrates auth state from `kc_tokens` written by a previous mock login or
   * refresh. Returns false (leaving the caller to fall back to the signed-out
   * state) when the entry is absent, unparseable or the access token expired.
   */
  async #restoreMockSession(): Promise<boolean> {
    if (!this.isBrowser || !environment.mockLoginEnabled) return false;

    const raw = localStorage.getItem('kc_tokens');
    if (!raw) return false;

    let tokens: KeycloakTokens;
    try {
      tokens = JSON.parse(raw) as KeycloakTokens;
    } catch {
      return false;
    }
    if (!tokens?.access_token || !tokens.refresh_token) return false;

    const exp = this.#decodeJwtExpirationEpoch(tokens.access_token);
    const nowSec = Math.floor(Date.now() / 1000);
    if (exp === null || exp <= nowSec) return false;

    this.#mockLoginUsed = true;
    this.#state.update(s => ({
      ...s,
      isAuthenticated: true,
      tokens,
      loading: false,
      error: null,
    }));

    // Enrich with the profile; a failed lookup keeps the restored session.
    await this.loadUserProfileFromTokens(tokens);
    return true;
  }

  private storeTokens(tokens: KeycloakTokens): void {
    if (this.isBrowser) localStorage.setItem('kc_tokens', JSON.stringify(tokens));
  }

  private async loadUserProfileFromTokens(tokens: KeycloakTokens): Promise<void> {
    try {
      const response = await fetch(`${environment.apiUrl.replace('/api/v1', '')}/realms/compass/protocol/openid-connect/userinfo`, {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      if (!response.ok) throw new Error('Failed to load profile');
      const profile = await response.json();
      this.#state.set({
        isAuthenticated: true,
        user: profile,
        tokens,
        loading: false,
        error: null,
      });
    } catch (error) {
      console.error('Failed to load profile from tokens:', error);
      this.#state.update(s => ({ ...s, loading: false, error: 'Failed to load profile' }));
    }
  }
}