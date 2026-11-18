import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, GuardResult, Router, RouterStateSnapshot, UrlTree } from '@angular/router';
import { stageGuard } from './stage.guard';
import { ApiClientService } from '../../core/api/api-client.service';
import { IdpStoreService } from '../../core/state/idp-store.service';
import { SseService } from '../../core/api/sse.service';
import { EmployeeContextResponse } from '../../models/idp.models';

/**
 * T-6: deep-link regression. The guard runs before the shell exists, so it
 * must await the shared context load before deciding. These tests drive the
 * real store + workflow against a stubbed ApiClientService (same pattern as
 * idp-store.service.spec.ts) and assert the two deep-link outcomes.
 */

type ResourceStatus = 'idle' | 'loading' | 'resolved' | 'local' | 'error';

interface FakeRef {
  status(): ResourceStatus;
  value(): unknown;
  error(): unknown;
  destroy(): void;
}

function okRef<T>(value: T): FakeRef {
  return { status: () => 'resolved', value: () => value, error: () => null, destroy: () => undefined };
}

function errRef(error: unknown): FakeRef {
  return { status: () => 'error', value: () => null, error: () => error, destroy: () => undefined };
}

/** Backend state for the reported bug: context present, workflow at stage 4. */
const STAGE_4_RESPONSE: EmployeeContextResponse = {
  context: {
    employeeId: 'emp-001',
    fullName: 'Иван Иванов',
    managerFullName: 'Пётр Петров',
    hasActiveIdpWarning: false,
    currentPosition: 'Middle Frontend Developer',
    targetPosition: 'Senior Frontend Developer',
    returnUrl: 'https://portal/work',
    isNewEmployee: false,
  },
  scenario: 'known_employee',
  stage: 'STAGE_4_REFINEMENT',
  isNewEmployee: false,
  returnUrl: 'https://portal/work',
};

const ONBOARDING_TREE = { url: '/idp/onboarding' } as unknown as UrlTree;

describe('stageGuard (T-6 deep link)', () => {
  let store: IdpStoreService;
  let getContextFn: ReturnType<typeof vi.fn>;
  let parseUrlFn: ReturnType<typeof vi.fn>;

  /**
   * Drives the zoneless effect scheduler so the store's awaitResource settles.
   * Handlers are attached synchronously so a rejection is never unhandled.
   */
  async function settle<T>(promise: Promise<T>): Promise<{ ok: true; value: T } | { ok: false; error: unknown }> {
    let outcome: { ok: true; value: T } | { ok: false; error: unknown } | undefined;
    const guarded = promise.then(
      (value: T) => { outcome = { ok: true, value }; },
      (error: unknown) => { outcome = { ok: false, error }; },
    );
    TestBed.tick();
    await new Promise((resolve) => setTimeout(resolve, 0));
    TestBed.tick();
    await guarded;
    return outcome as { ok: true; value: T } | { ok: false; error: unknown };
  }

  /** Runs the guard for a child path under /idp (e.g. 'draft'). */
  function startGuard(path: string): Promise<GuardResult> {
    const route = { routeConfig: { path } } as unknown as ActivatedRouteSnapshot;
    return Promise.resolve(
      TestBed.runInInjectionContext(() => stageGuard(route, {} as RouterStateSnapshot)),
    ) as Promise<GuardResult>;
  }

  beforeEach(() => {
    getContextFn = vi.fn();
    parseUrlFn = vi.fn((url: string) =>
      url === '/idp/onboarding' ? ONBOARDING_TREE : ({ url } as unknown as UrlTree),
    );

    TestBed.configureTestingModule({
      providers: [
        { provide: ApiClientService, useValue: { getContext: getContextFn } as unknown as ApiClientService },
        { provide: SseService, useValue: {} as unknown as SseService },
        { provide: Router, useValue: { parseUrl: parseUrlFn, navigate: vi.fn() } },
      ],
    });

    store = TestBed.inject(IdpStoreService);
  });

  it('allows /idp/draft when the loaded context reports targetPosition and stage 4', async () => {
    getContextFn.mockReturnValue(okRef(STAGE_4_RESPONSE));

    const outcome = await settle(startGuard('draft'));

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value).toBe(true);
    expect(getContextFn).toHaveBeenCalledTimes(1);
    expect(store.context()?.targetPosition).toBe('Senior Frontend Developer');
    expect(store.currentStage()).toBe('STAGE_4_REFINEMENT');
    expect(parseUrlFn).not.toHaveBeenCalled();
  });

  it('redirects a failed context load to /idp/onboarding', async () => {
    getContextFn.mockReturnValue(
      errRef({ error: 'unauthorized', message: 'Token expired' }),
    );

    const outcome = await settle(startGuard('draft'));

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value).toBe(ONBOARDING_TREE);
    expect(parseUrlFn).toHaveBeenCalledWith('/idp/onboarding');
    expect(store.context()).toBeNull();
    expect(store.contextError()).not.toBeNull();
  });

  it('does not reload the context when it is already available', async () => {
    store.setContext(STAGE_4_RESPONSE.context);
    store.setStage('STAGE_4_REFINEMENT');

    const outcome = await settle(startGuard('draft'));

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value).toBe(true);
    expect(getContextFn).not.toHaveBeenCalled();
  });
});
