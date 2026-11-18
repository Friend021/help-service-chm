import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { ActivatedRoute, Router } from '@angular/router';
import { CallbackComponent } from './callback.component';
import { AuthService } from '../../../core/auth/auth.service';

/**
 * D-4/B4 tests for the callback error path (#22): a hung auth initialization
 * must not leave an eternal spinner — it surfaces an error and goes to /login.
 */

describe('CallbackComponent', () => {
  let router: { navigate: ReturnType<typeof vi.fn>; navigateByUrl: ReturnType<typeof vi.fn> };
  let auth: { loading: ReturnType<typeof signal<boolean>>; waitForInit: ReturnType<typeof vi.fn> };

  function configure(loading: boolean, init: () => Promise<void>, returnUrl = '/idp'): void {
    auth = { loading: signal(loading), waitForInit: vi.fn(init) };
    router = {
      navigate: vi.fn(async () => true),
      navigateByUrl: vi.fn(async () => true),
    };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [CallbackComponent],
      providers: [
        provideNoopAnimations(),
        { provide: AuthService, useValue: auth },
        { provide: Router, useValue: router },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParams: { returnUrl } } },
        },
      ],
    });
  }

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows an error and redirects to /login when auth init hangs', async () => {
    vi.useFakeTimers();
    configure(true, () => new Promise<void>(() => undefined));

    const fixture = TestBed.createComponent(CallbackComponent);
    const component = fixture.componentInstance;

    await vi.advanceTimersByTimeAsync(15_000);

    expect(component.error()).toContain('слишком много времени');
    expect(router.navigate).toHaveBeenCalledWith(['/login']);
    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });

  it('navigates to the returnUrl when init resolves normally', async () => {
    configure(false, async () => undefined, '/draft');

    const fixture = TestBed.createComponent(CallbackComponent);
    TestBed.tick();
    await Promise.resolve();

    expect(fixture.componentInstance.error()).toBeNull();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/draft');
    expect(router.navigate).not.toHaveBeenCalled();
  });
});
