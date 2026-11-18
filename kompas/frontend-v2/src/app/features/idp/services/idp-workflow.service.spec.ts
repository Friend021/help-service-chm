import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { IdpWorkflowService } from './idp-workflow.service';
import { ApiClientService } from '../../../core/api/api-client.service';
import { IdpStoreService } from '../../../core/state/idp-store.service';
import { SseService, SseConnectError } from '../../../core/api/sse.service';
import { toApiError } from '../../../core/api/api-error';
import { Scenario, SseEvent, WorkflowStage } from '../../../models/idp.models';

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

const SCENARIO_RESPONSE = {
  scenario: 'known_employee' as Scenario,
  stage: 'STAGE_2_QUESTIONNAIRE' as WorkflowStage,
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
};

describe('IdpWorkflowService', () => {
  let workflow: IdpWorkflowService;
  let setScenarioFn: ReturnType<typeof vi.fn>;
  let clearSessionFn: ReturnType<typeof vi.fn>;
  let loadContextFn: ReturnType<typeof vi.fn>;
  let loadDictionariesFn: ReturnType<typeof vi.fn>;
  let addChatMessageFn: ReturnType<typeof vi.fn>;
  let setStreamingFn: ReturnType<typeof vi.fn>;
  let ratingsFn: ReturnType<typeof vi.fn>;
  let navigateFn: ReturnType<typeof vi.fn>;
  let sseStub: {
    connect: ReturnType<typeof vi.fn>;
    initAssessment: ReturnType<typeof vi.fn>;
    generateDraft: ReturnType<typeof vi.fn>;
    refineDraft: ReturnType<typeof vi.fn>;
  };

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

  function assistantMessages(): string[] {
    return addChatMessageFn.mock.calls
      .map(([message]) => message as { role: string; content: string })
      .filter((message) => message.role === 'assistant')
      .map((message) => message.content);
  }

  beforeEach(() => {
    setScenarioFn = vi.fn().mockReturnValue(okRef(SCENARIO_RESPONSE));
    clearSessionFn = vi.fn();
    loadContextFn = vi.fn().mockResolvedValue(undefined);
    loadDictionariesFn = vi.fn().mockResolvedValue(undefined);
    addChatMessageFn = vi.fn();
    setStreamingFn = vi.fn();
    ratingsFn = vi.fn().mockReturnValue(new Map<string, number | null>([['s1', 4]]));
    navigateFn = vi.fn().mockResolvedValue(true);

    const apiStub = {
      setScenario: setScenarioFn,
    } as unknown as ApiClientService;

    const storeStub = {
      clearSession: clearSessionFn,
      loadContext: loadContextFn,
      loadDictionaries: loadDictionariesFn,
      ratings: ratingsFn,
      plannedTasks: vi.fn().mockReturnValue(''),
      addChatMessage: addChatMessageFn,
      setStreaming: setStreamingFn,
    } as unknown as IdpStoreService;

    sseStub = {
      connect: vi.fn(),
      initAssessment: vi.fn(),
      generateDraft: vi.fn(),
      refineDraft: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: ApiClientService, useValue: apiStub },
        { provide: IdpStoreService, useValue: storeStub },
        { provide: SseService, useValue: sseStub as unknown as SseService },
        { provide: Router, useValue: { navigate: navigateFn } },
      ],
    });

    workflow = TestBed.inject(IdpWorkflowService);
  });

  describe('switchScenario', () => {
    it('POSTs /mock/scenario and reloads context/dictionaries without locally deriving stage', async () => {
      const outcome = await settle(workflow.switchScenario('known_employee'));

      expect(outcome.ok).toBe(true);
      expect(setScenarioFn).toHaveBeenCalledTimes(1);
      expect(setScenarioFn).toHaveBeenCalledWith('known_employee');
      expect(clearSessionFn).toHaveBeenCalledBefore(setScenarioFn);
      expect(loadContextFn).toHaveBeenCalledTimes(1);
      expect(loadDictionariesFn).toHaveBeenCalledTimes(1);
    });

    it('propagates scenario through to the backend for new_employee', async () => {
      const outcome = await settle(workflow.switchScenario('new_employee'));

      expect(outcome.ok).toBe(true);
      expect(setScenarioFn).toHaveBeenCalledWith('new_employee');
    });
  });

  describe('loadContext in-flight sharing (T-6)', () => {
    it('returns the same promise to concurrent callers and issues one request', async () => {
      let resolveLoad!: () => void;
      loadContextFn.mockImplementation(
        () => new Promise<void>((resolve) => { resolveLoad = resolve; }),
      );

      const first = workflow.loadContext();
      const second = workflow.loadContext();

      expect(second).toBe(first);
      expect(loadContextFn).toHaveBeenCalledTimes(1);

      resolveLoad();
      await first;

      // Settled + idempotent: no further request for a plain re-entry.
      await workflow.loadContext();
      expect(loadContextFn).toHaveBeenCalledTimes(1);
    });

    it('allows a retry after a failed load', async () => {
      const failure = new Error('context unavailable');
      loadContextFn.mockRejectedValueOnce(failure);

      await expect(workflow.loadContext()).rejects.toBe(failure);
      expect(loadContextFn).toHaveBeenCalledTimes(1);

      loadContextFn.mockResolvedValueOnce(undefined);
      await workflow.loadContext();
      expect(loadContextFn).toHaveBeenCalledTimes(2);
    });
  });

  describe('SSE error surfacing (#17)', () => {
    it('surfaces a code-specific message for a 409 draft_missing instead of the generic fallback', async () => {
      sseStub.generateDraft.mockImplementation(() =>
        (async function* () {
          throw new SseConnectError(
            toApiError({ error: 'draft_missing', message: 'Черновик не создан' }, 409),
          );
        })(),
      );

      await workflow.generateDraft();

      expect(assistantMessages()).toEqual(['Черновик плана не найден. Сначала сгенерируйте черновик.']);
    });

    it('distinguishes an expired session (401) from a missing draft', async () => {
      sseStub.initAssessment.mockImplementation(() =>
        (async function* () {
          throw new SseConnectError(
            toApiError({ error: 'unauthorized', message: 'Token expired' }, 401),
          );
        })(),
      );

      await workflow.initializeAssessment();

      expect(assistantMessages()).toEqual([
        'Сессия истекла. Войдите снова и повторите действие.',
      ]);
      // 401 is not the context-incomplete redirect case.
      expect(navigateFn).not.toHaveBeenCalled();
    });

    it('uses the mid-stream ERROR payload code/message for the chat message', async () => {
      sseStub.generateDraft.mockImplementation(() =>
        (async function* () {
          yield {
            event: 'ERROR',
            data: { type: 'ERROR', code: 'LLM_TIMEOUT', message: 'LLM did not respond' },
          } as SseEvent;
        })(),
      );

      await workflow.generateDraft();

      expect(assistantMessages()).toEqual(['Модель не ответила вовремя. Попробуйте снова.']);
    });

    it('still redirects to onboarding for context_incomplete on init-assessment', async () => {
      sseStub.initAssessment.mockImplementation(() =>
        (async function* () {
          throw new SseConnectError(
            toApiError({ error: 'context_incomplete', message: 'Context incomplete' }, 409),
          );
        })(),
      );

      await workflow.initializeAssessment();

      expect(assistantMessages()).toEqual(['Контекст задан неполностью — укажите должности.']);
      expect(navigateFn).toHaveBeenCalledWith(['/idp/onboarding']);
    });
  });
});
