import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { ActivatedRoute, Router } from '@angular/router';
import { LoginComponent, safeReturnUrl } from './login.component';
import { AuthService } from '../../../core/auth/auth.service';

/**
 * D-4/B4 tests for post-login navigation (#18): the mock login must honour
 * `?returnUrl=` (as appended by authGuard) but never follow an open redirect.
 */

describe('LoginComponent mock login navigation', () => {
  let router: { navigateByUrl: ReturnType<typeof vi.fn>; navigate: ReturnType<typeof vi.fn> };
  let returnUrl: string | null;

  function createAuth(authenticated = true) {
    return {
      loading: signal(false),
      error: signal<string | null>(null),
      isAuthenticated: vi.fn(() => authenticated),
      mockLogin: vi.fn(async () => undefined),
    };
  }

  async function login(authenticated = true): Promise<LoginComponent> {
    const auth = createAuth(authenticated);
    router = {
      navigateByUrl: vi.fn(async () => true),
      navigate: vi.fn(async () => true),
    };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [LoginComponent],
      providers: [
        provideNoopAnimations(),
        { provide: AuthService, useValue: auth },
        { provide: Router, useValue: router },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              queryParams: { returnUrl },
              queryParamMap: { get: (key: string) => (key === 'returnUrl' ? returnUrl : null) },
            },
          },
        },
      ],
    });

    const fixture = TestBed.createComponent(LoginComponent);
    const component = fixture.componentInstance;
    component.username = 'demo';
    component.password = 'demo';
    await component.mockLogin();
    return component;
  }

  beforeEach(() => {
    returnUrl = null;
  });

  it('navigates to the guard-provided returnUrl on success', async () => {
    returnUrl = '/draft';
    await login();

    expect(router.navigateByUrl).toHaveBeenCalledWith('/draft');
  });

  it('defaults to /idp when returnUrl is absent', async () => {
    returnUrl = null;
    await login();

    expect(router.navigateByUrl).toHaveBeenCalledWith('/idp');
  });

  it('rejects absolute and scheme-relative returnUrl values (open redirect)', async () => {
    for (const unsafe of ['https://evil.example', '//evil.example', '/\\evil.example', '/%2F%2Fevil.example']) {
      TestBed.resetTestingModule();
      returnUrl = unsafe;
      await login();

      expect(router.navigateByUrl).toHaveBeenCalledWith('/idp');
      expect(router.navigateByUrl).not.toHaveBeenCalledWith(unsafe);
    }
  });

  it('does not navigate when authentication failed', async () => {
    returnUrl = '/draft';
    await login(false);

    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });
});

describe('safeReturnUrl', () => {
  it('accepts in-app paths only', () => {
    expect(safeReturnUrl('/idp/onboarding')).toBe('/idp/onboarding');
    expect(safeReturnUrl('/draft?task=1')).toBe('/draft?task=1');
    expect(safeReturnUrl(null)).toBe('/idp');
    expect(safeReturnUrl('')).toBe('/idp');
    expect(safeReturnUrl('idp')).toBe('/idp');
    expect(safeReturnUrl('https://evil.example/idp')).toBe('/idp');
    expect(safeReturnUrl('//evil.example')).toBe('/idp');
    expect(safeReturnUrl('/\\evil.example')).toBe('/idp');
    expect(safeReturnUrl('/%2F%2Fevil.example')).toBe('/idp');
  });
});
