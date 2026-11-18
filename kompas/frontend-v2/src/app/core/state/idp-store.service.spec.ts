import { TestBed } from '@angular/core/testing';
import { IdpStoreService, } from './idp-store.service';
import { ApiClientService } from '../api/api-client.service';
import { ApiError } from '../api/api-error';
import {
  EmployeeContext,
  EmployeeContextResponse,
  ExportResponse,
  IdpDraftResponse,
  IdpPlan,
  SkillAssessmentItem,
  WorkflowStage,
} from '../../models/idp.models';

/**
 * D-2 pure-logic unit tests for IdpStoreService.
 * ApiClientService is stubbed; every stub method returns a fake
 * HttpResourceRef (signal-like accessors) so the store's awaitResource/effect
 * plumbing resolves without real HTTP. `TestBed.tick()` + a macrotask flush
 * drive the zoneless effect scheduler.
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

function errRef<T>(error: unknown): FakeRef {
  return { status: () => 'error', value: () => null as unknown as T, error: () => error, destroy: () => undefined };
}

/** A request that never settles (status stays 'loading'). */
function pendingRef<T>(): FakeRef {
  return { status: () => 'loading', value: () => null as unknown as T, error: () => null, destroy: vi.fn() };
}

const CONTEXT: EmployeeContext = {
  employeeId: 'e1',
  fullName: 'Иван Иванов',
  managerFullName: 'Пётр Петров',
  hasActiveIdpWarning: false,
  currentPosition: 'Dev',
  targetPosition: 'Lead',
  returnUrl: 'https://portal/work',
  isNewEmployee: false,
};

const CONTEXT_RESPONSE: EmployeeContextResponse = {
  context: CONTEXT,
  scenario: 'known_employee',
  stage: 'STAGE_2_QUESTIONNAIRE',
  isNewEmployee: false,
  returnUrl: 'https://portal/work',
};

/** Wire-shape error body (what toApiError receives first). */
const WIRE_ERROR_422 = {
  error: 'VALIDATION_ERROR',
  message: 'План невалиден',
  validationErrors: [
    { path: 'plan.directions[0].tasks[1].deadLine', message: 'Deadline must not be in the past' },
    { path: 'plan.mainGoal', message: 'Пустая цель' },
  ],
};

describe('IdpStoreService', () => {
  let store: IdpStoreService;
  let getContextFn: ReturnType<typeof vi.fn>;
  let getDraftFn: ReturnType<typeof vi.fn>;
  let updateDraftFn: ReturnType<typeof vi.fn>;
  let exportPlanFn: ReturnType<typeof vi.fn>;

  /**
   * Drives the zoneless effect scheduler so awaitResource settles. The
   * then-handlers are attached synchronously (before any tick can reject the
   * promise) so a rejection is never observed as "unhandled" by Vitest.
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

  beforeEach(() => {
    getContextFn = vi.fn();
    getDraftFn = vi.fn();
    updateDraftFn = vi.fn();
    exportPlanFn = vi.fn();
    const apiStub = {
      getContext: getContextFn,
      getDraft: getDraftFn,
      updateDraft: updateDraftFn,
      exportPlan: exportPlanFn,
    } as unknown as ApiClientService;

    TestBed.configureTestingModule({
      providers: [{ provide: ApiClientService, useValue: apiStub }],
    });
    store = TestBed.inject(IdpStoreService);
  });

  describe('awaitResource timeout (D-3r #14)', () => {
    it('rejects with a TIMEOUT ApiError and disposes the resource when the request hangs', async () => {
      const hung = pendingRef<EmployeeContextResponse>();
      getContextFn.mockReturnValue(hung);
      vi.useFakeTimers();
      try {
        // Attach handlers before advancing time so the rejection is never unhandled.
        let outcome: { ok: true; value: EmployeeContextResponse } | { ok: false; error: unknown } | undefined;
        const guarded = store.loadContext().then(
          (value) => { outcome = { ok: true, value }; },
          (error: unknown) => { outcome = { ok: false, error }; },
        );

        // Nothing settles while the request is merely slow but within the budget.
        await vi.advanceTimersByTimeAsync(10_000);
        expect(outcome).toBeUndefined();

        await vi.advanceTimersByTimeAsync(2_500);
        await guarded;

        expect(outcome?.ok).toBe(false);
        if (!outcome || outcome.ok) throw new Error('Expected loadContext to reject on timeout');
        const apiError = outcome.error as ApiError;
        expect(apiError.code).toBe('TIMEOUT');
        expect(apiError.message).toContain('вовремя');
        // The effect + resource are torn down, and the error is surfaced.
        expect(hung.destroy).toHaveBeenCalledTimes(1);
        expect(store.contextError()?.code).toBe('TIMEOUT');
        expect(store.context()).toBeNull();
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('backend-driven scenario/stage (D-3r #21)', () => {
    it('exposes no local setScenario/nextStage mutators', () => {
      const surface = store as unknown as Record<string, unknown>;
      expect(surface['setScenario']).toBeUndefined();
      expect(surface['nextStage']).toBeUndefined();
    });
  });

  describe('updateDraftPlan', () => {
    it('stores the server draft, response and exportedAt WITHOUT mirroring the stage on success', async () => {
      // M2: PUT /idp/draft no longer mirrors the response stage — the stage
      // comes from SSE STAGE_UPDATE / GET /session/context / confirm only, so
      // an edit after confirm (stage 5) must not flip the stage back to 4.
      const previous: IdpPlan = { mainGoal: 'Local goal', directions: [] };
      store.setDraft(previous);
      const response: IdpDraftResponse = {
        stage: 'STAGE_4_REFINEMENT',
        plan: { mainGoal: 'Server goal', directions: [] },
        isValid: true,
        validationErrors: [],
        exportedAt: '2026-05-01T00:00:00.000Z',
      };
      updateDraftFn.mockReturnValue(okRef(response));

      const outcome = await settle(store.updateDraftPlan({ mainGoal: 'Merged goal' }));
      expect(outcome.ok).toBe(true);

      expect(store.draft().mainGoal).toBe('Server goal');
      expect(store.draftResponse()).toEqual(response);
      expect(store.exportedAt()).toBe('2026-05-01T00:00:00.000Z');
      // Stage stays whatever the backend navigation set it to — unmirrored here.
      expect(store.currentStage()).toBe('STAGE_1_CONTEXT');
      expect(store.validationErrors()).toEqual([]);
      // The merged plan (not the raw patch) is what got sent.
      const sent = updateDraftFn.mock.calls[0]?.[0] as IdpPlan;
      expect(sent.mainGoal).toBe('Merged goal');
      expect(sent.directions).toEqual([]);
    });

    it('rolls back to the previous draft and stores validationErrors on an ApiError 422', async () => {
      const previous: IdpPlan = { mainGoal: 'Original', directions: [] };
      store.setDraft(previous);
      updateDraftFn.mockReturnValue(errRef<IdpDraftResponse>(WIRE_ERROR_422));

      const outcome = await settle(store.updateDraftPlan({ mainGoal: 'New goal' }));
      expect(outcome.ok).toBe(false);
      if (outcome.ok) throw new Error('Expected updateDraftPlan to reject');
      const apiError = outcome.error as ApiError;

      expect(apiError.code).toBe('VALIDATION_ERROR');
      expect(apiError.message).toBe('План невалиден');
      expect(apiError.validationErrors?.length).toBe(2);
      // Optimistic update is undone.
      expect(store.draft().mainGoal).toBe('Original');
      // Validation errors surfaced in structured form.
      expect(store.validationErrors()).toEqual([
        { path: 'plan.directions[0].tasks[1].deadLine', message: 'Deadline must not be in the past' },
        { path: 'plan.mainGoal', message: 'Пустая цель' },
      ]);
      expect(store.isDraftValid()).toBe(false);
    });

    it('ignores a stale PUT response that resolves after a newer save started (C2)', async () => {
      store.setDraft({ mainGoal: 'Original', directions: [] });
      const stale: IdpDraftResponse = {
        stage: 'STAGE_1_CONTEXT',
        plan: { mainGoal: 'Stale goal', directions: [] },
        isValid: true,
        validationErrors: [],
        exportedAt: null,
      };
      const fresh: IdpDraftResponse = {
        stage: 'STAGE_1_CONTEXT',
        plan: { mainGoal: 'Fresh goal', directions: [] },
        isValid: true,
        validationErrors: [],
        exportedAt: '2026-05-02T00:00:00.000Z',
      };
      // Draft edit 1 then draft edit 2; edit 1's response arrives last.
      updateDraftFn.mockReturnValueOnce(okRef(stale)).mockReturnValueOnce(okRef(fresh));

      const p1 = store.updateDraftPlan({ mainGoal: 'First edit' });
      const p2 = store.updateDraftPlan({ mainGoal: 'Second edit' });
      const o1 = await settle(p1);
      const o2 = await settle(p2);

      // API signature unchanged: both callers still receive their own response.
      expect(o1.ok).toBe(true);
      expect(o2.ok).toBe(true);
      // The stale response must not overwrite the newer plan/state.
      expect(store.draft().mainGoal).toBe('Fresh goal');
      expect(store.draftResponse()).toEqual(fresh);
      expect(store.exportedAt()).toBe('2026-05-02T00:00:00.000Z');
    });

    it('does not let a stale failed PUT roll back a newer successful save (C2)', async () => {
      store.setDraft({ mainGoal: 'Original', directions: [] });
      const fresh: IdpDraftResponse = {
        stage: 'STAGE_1_CONTEXT',
        plan: { mainGoal: 'Fresh goal', directions: [] },
        isValid: true,
        validationErrors: [],
        exportedAt: null,
      };
      // Edit 1 fails with a 422; edit 2 succeeds before edit 1 settles.
      updateDraftFn
        .mockReturnValueOnce(errRef<IdpDraftResponse>(WIRE_ERROR_422))
        .mockReturnValueOnce(okRef(fresh));

      const p1 = store.updateDraftPlan({ mainGoal: 'First edit' });
      const p2 = store.updateDraftPlan({ mainGoal: 'Second edit' });
      const o1 = await settle(p1);
      const o2 = await settle(p2);

      expect(o1.ok).toBe(false);
      expect(o2.ok).toBe(true);
      // The stale rollback must not clobber the newer successful state.
      expect(store.draft().mainGoal).toBe('Fresh goal');
      // Stale validation errors must not leak into the newer save's state.
      expect(store.validationErrors()).toEqual([]);
      expect(store.isDraftValid()).toBe(true);
    });
  });

  describe('ensureDraftLoaded', () => {
    it('hydrates the draft via GET /idp/draft when nothing is in memory (reload at stage 3-5)', async () => {
      const response: IdpDraftResponse = {
        stage: 'STAGE_4_REFINEMENT',
        plan: { mainGoal: 'Server goal', directions: [] },
        isValid: true,
        validationErrors: [],
        exportedAt: null,
      };
      getDraftFn.mockReturnValue(okRef(response));

      const outcome = await settle(store.ensureDraftLoaded());
      expect(outcome.ok).toBe(true);
      expect(getDraftFn).toHaveBeenCalledOnce();
      expect(store.draft().mainGoal).toBe('Server goal');
      // Hydration still mirrors the backend stage (GET /idp/draft is a
      // backend-sourced response like context/confirm).
      expect(store.currentStage()).toBe('STAGE_4_REFINEMENT');
    });

    it('skips the GET when a plan already lives in memory (in-flight session)', async () => {
      store.setDraft({ mainGoal: 'Local goal', directions: [] });

      const outcome = await settle(store.ensureDraftLoaded());

      expect(outcome.ok).toBe(true);
      expect(getDraftFn).not.toHaveBeenCalled();
      expect(store.draft().mainGoal).toBe('Local goal');
    });

    it('swallows a failed GET instead of breaking component init', async () => {
      getDraftFn.mockReturnValue(
        errRef<IdpDraftResponse>({ error: 'SESSION_NOT_FOUND', message: 'Сессия не найдена' }),
      );

      const outcome = await settle(store.ensureDraftLoaded());

      expect(outcome.ok).toBe(true);
      expect(store.draft().mainGoal).toBe('');
    });
  });

  describe('loadContext', () => {
    it('stores the context, scenario and mirrors the backend stage', async () => {
      getContextFn.mockReturnValue(okRef(CONTEXT_RESPONSE));
      store.contextError.set({ code: 'STALE', message: 'stale' }); // cleared on success

      const outcome = await settle(store.loadContext());
      expect(outcome.ok).toBe(true);
      const response = (outcome as { ok: true; value: EmployeeContextResponse }).value;
      expect(store.context()).toEqual(CONTEXT);
      expect(store.scenario()).toBe('known_employee');
      expect(store.currentStage()).toBe('STAGE_2_QUESTIONNAIRE');
      expect(store.contextError()).toBeNull();
      expect(response.context.fullName).toBe('Иван Иванов');
    });

    it('stores null context and a typed error on failure', async () => {
      getContextFn.mockReturnValue(
        errRef<EmployeeContextResponse>({
          error: 'SESSION_NOT_FOUND',
          message: 'Сессия не найдена',
        }),
      );
      store.setContext(CONTEXT);

      const outcome = await settle(store.loadContext());
      expect(outcome.ok).toBe(false);
      if (outcome.ok) throw new Error('Expected loadContext to reject');
      const apiError = outcome.error as ApiError;
      expect(apiError.code).toBe('SESSION_NOT_FOUND');
      expect(apiError.message).toBe('Сессия не найдена');
      expect(apiError.code).toBe('SESSION_NOT_FOUND');
      expect(store.context()).toBeNull();
      expect(store.contextError()?.code).toBe('SESSION_NOT_FOUND');
      expect(store.currentStage()).toBe('STAGE_1_CONTEXT'); // stage not mirrored on error
    });
  });

  describe('exportPlan', () => {
    it('returns the returnUrl from the export response', async () => {
      const response: ExportResponse = { success: true, returnUrl: 'https://portal/idp/42' };
      exportPlanFn.mockReturnValue(okRef(response));

      const outcome = await settle(store.exportPlan());
      expect(outcome.ok).toBe(true);
      const result = (outcome as { ok: true; value: ExportResponse }).value;
      expect(result.success).toBe(true);
      expect(result.returnUrl).toBe('https://portal/idp/42');
    });

    it('stores validationErrors and rethrows on failure', async () => {
      exportPlanFn.mockReturnValue(errRef<ExportResponse>(WIRE_ERROR_422));

      const outcome = await settle(store.exportPlan());
      expect(outcome.ok).toBe(false);
      if (outcome.ok) throw new Error('Expected exportPlan to reject');
      const apiError = outcome.error as ApiError;
      expect(apiError.code).toBe('VALIDATION_ERROR');
      expect(apiError.message).toBe('План невалиден');
      expect(store.validationErrors().length).toBe(2);
      expect(store.isDraftValid()).toBe(false);
    });
  });

  describe('setSkills', () => {
    it('preserves existing ratings for ids in both lists, dropping removed ids (M7)', () => {
      store.setSkills([
        { skillId: 's1', skillName: 'Angular', description: 'desc', rating: null },
        { skillId: 's2', skillName: 'RxJS', description: 'desc', rating: null },
      ]);
      store.updateRating('s1', 4);
      store.updateRating('s2', 2);

      // Re-init with a new list: s1 kept, s2 removed, s3 is new and unrated.
      store.setSkills([
        { skillId: 's1', skillName: 'Angular', description: 'desc', rating: null },
        { skillId: 's3', skillName: 'Jest', description: 'desc', rating: null },
      ]);

      expect(store.getRating('s1')).toBe(4); // preserved, not silently reset
      expect(store.getRating('s2')).toBeUndefined(); // removed id's rating dropped
      expect(store.getRating('s3')).toBeUndefined(); // new id starts unrated
    });
  });

  describe('updateRating', () => {
    it('stores the rating in the map and mirrors it on the skill item', () => {
      const skills: SkillAssessmentItem[] = [
        { skillId: 's1', skillName: 'Angular', description: 'desc', rating: null },
        { skillId: 's2', skillName: 'RxJS', description: 'desc', rating: null },
      ];
      store.setSkills(skills);
      expect(store.allSkillsRated()).toBe(false);

      store.updateRating('s1', 4);

      expect(store.getRating('s1')).toBe(4);
      expect(store.getRating('s2')).toBeUndefined();
      expect(store.skills().find((s) => s.skillId === 's1')?.rating).toBe(4);
      expect(store.skills().find((s) => s.skillId === 's2')?.rating).toBeNull();

      store.updateRating('s1', 2); // overwrite, other entries untouched
      expect(store.getRating('s1')).toBe(2);
      expect(store.getRating('s2')).toBeUndefined();

      store.updateRating('s2', 5);
      expect(store.allSkillsRated()).toBe(true);
    });
  });
});

// Keep the WorkflowStage type import referenced for stage literals above.
type _StageCheck = WorkflowStage;
