import { Injectable, inject, Injector, effect, untracked, runInInjectionContext } from '@angular/core';
import { HttpResourceRef } from '@angular/common/http';
import { Router } from '@angular/router';
import { IdpStoreService } from '../../../core/state/idp-store.service';
import { ApiClientService } from '../../../core/api/api-client.service';
import { toApiError } from '../../../core/api/api-error';
import { SseService, SseConnectError } from '../../../core/api/sse.service';
import {
  ChatMessage,
  IdpPlanDraft,
  PlanDraftUpdatePayload,
  SseEvent,
  Scenario,
  WorkflowStage,
} from '../../../models/idp.models';

/** Canonical stage order — route guards treat it as the allowed forward direction. */
const STAGE_ORDER: WorkflowStage[] = [
  'STAGE_1_CONTEXT',
  'STAGE_1_2_ONBOARDING',
  'STAGE_2_QUESTIONNAIRE',
  'STAGE_3_DRAFT_GEN',
  'STAGE_4_REFINEMENT',
  'STAGE_5_COMPLETED',
];

/**
 * Single orchestrator for the IDP workflow. Owns all async/SSE flows and
 * stage-guard logic; stage components stay thin and react via IdpStoreService
 * signals. Stage values are never invented here — store.currentStage is only
 * mirrored from backend responses (loadContext/confirm/… ) or SSE STAGE_UPDATE.
 */
@Injectable({ providedIn: 'root' })
export class IdpWorkflowService {
  private readonly store = inject(IdpStoreService);
  private readonly api = inject(ApiClientService); // dev-only mock control
  private readonly sse = inject(SseService);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);

  /** AbortController of the currently active SSE stream (one flow at a time). */
  private activeStreamController: AbortController | null = null;
  /** True once an ERROR SSE event was surfaced — guards against duplicate error messages. */
  private streamErrorSurfaced = false;
  /** Idempotency guards for shell init (safe under double init / dev reuse). */
  private contextLoaded = false;
  private dictionariesLoaded = false;
  /**
   * Single in-flight context load. The shell and stage guards both ask for the
   * context during a deep-link navigation; sharing one promise avoids a second
   * GET /session/context and lets every caller await the same result.
   */
  private contextPromise: Promise<void> | null = null;

  // --- Stage Guards ---
  // Allowed order = index in STAGE_ORDER. Back is always allowed; forward is
  // gated on workflow preconditions (context present; ratings complete for
  // stages beyond the questionnaire). Never mutates currentStage.
  canActivateStage(stage: WorkflowStage): boolean {
    const currentIndex = STAGE_ORDER.indexOf(this.store.currentStage());
    const targetIndex = STAGE_ORDER.indexOf(stage);
    if (targetIndex < 0) return false;
    // Back (or current stage) — always allowed.
    if (targetIndex <= currentIndex) return true;

    switch (stage) {
      case 'STAGE_1_CONTEXT':
        return true;
      case 'STAGE_1_2_ONBOARDING':
        // Onboarding is now the first user-facing step; it must be reachable
        // while the shell loads the context in the background.
        return true;
      case 'STAGE_2_QUESTIONNAIRE':
        return !!this.store.context()?.targetPosition;
      default:
        // STAGE_3_DRAFT_GEN / STAGE_4_REFINEMENT / STAGE_5_COMPLETED
        return this.store.allSkillsRated();
    }
  }

  // --- Stage 1: Context (delegates to store real async flows) ---

  /**
   * Loads the employee context once. Concurrent callers (shell init + stage
   * guard before the shell exists) receive the SAME in-flight promise instead
   * of issuing another request. The idempotency flag is kept for settled
   * loads; errors propagate to every caller and reset the flag so a later
   * visit can retry.
   */
  loadContext(scenario?: Scenario): Promise<void> {
    if (!scenario) {
      if (this.contextPromise) return this.contextPromise;
      if (this.contextLoaded) return Promise.resolve();
    }

    const promise = this.runLoadContext(scenario);
    this.contextPromise = promise;
    const clear = (): void => {
      if (this.contextPromise === promise) this.contextPromise = null;
    };
    promise.then(clear, clear);
    return promise;
  }

  private async runLoadContext(scenario?: Scenario): Promise<void> {
    this.contextLoaded = true;
    try {
      await this.store.loadContext(scenario);
    } catch (error) {
      if (!scenario) this.contextLoaded = false; // allow retry on next visit
      throw error;
    }
  }

  async submitManualContext(currentPosition: string, targetPosition: string): Promise<void> {
    await this.store.submitManualContext(currentPosition, targetPosition);
    this.contextLoaded = true;
  }

  // --- Stage 2: Assessment (SSE orchestration; stage comes from backend events) ---
  async initializeAssessment(): Promise<void> {
    await this.consumeStream(signal => this.sse.initAssessment(signal), {
      redirectOnContextIncomplete: true,
    });
  }

  async generateDraft(): Promise<void> {
    const ratings = [...this.store.ratings().entries()]
      .filter(([, rating]) => rating !== null)
      .map(([skillId, rating]) => ({ skillId, rating }));
    if (ratings.length === 0) return;
    const plannedTasks = this.store.plannedTasks();
    await this.consumeStream(signal => this.sse.generateDraft(ratings, plannedTasks, signal));
  }

  // --- Stage 4: Refinement ---
  async refineDraft(message: string): Promise<void> {
    if (!message.trim()) return;
    this.store.addChatMessage(this.buildMessage('user', message));
    await this.consumeStream(signal => this.sse.refineDraft(message, signal));
  }

  // --- Диалог заполнения ИПР (бэкенд задаёт вопросы и наполняет план) ---
  async startDialog(): Promise<void> {
    if (this.store.dialogActive()) return;
    await this.consumeStream(signal => this.sse.dialog(undefined, signal));
  }

  async sendDialogMessage(message: string): Promise<void> {
    if (!message.trim()) return;
    this.store.addChatMessage(this.buildMessage('user', message));
    await this.consumeStream(signal => this.sse.dialog(message, signal));
  }

  // --- Stage 5: Completion ---
  async confirmPlan(): Promise<void> {
    const plan = this.store.draft();
    const draft: IdpPlanDraft = {
      mainGoal: plan.mainGoal,
      directions: plan.directions.map(d => ({
        rank: d.rank,
        goal: d.goal,
        description: d.description,
        tasks: d.tasks.map(t => ({
          developmentTool: t.developmentTool,
          comment: t.comment,
          deadLine: t.deadLine,
          description: t.description,
        })),
      })),
    };
    const response = await this.store.confirmPlan(draft);
    this.store.setDraft(response.plan);
    this.store.setValidationErrors(response.validationErrors);
    // stage mirrored by the store from response.stage
    await this.router.navigate(['/idp/completion']);
  }

  /**
   * POST /idp/export. Redirect is the backend-provided LEGACY_RETURN_URL and
   * happens here on success; the caller only needs to care about failures.
   */
  async exportPlan(): Promise<string | null> {
    const response = await this.store.exportPlan();
    if (response.success && response.returnUrl) {
      window.location.href = response.returnUrl;
      return response.returnUrl;
    }
    return null;
  }

  // --- Shell helpers ---
  async loadDictionariesOnce(): Promise<void> {
    if (this.dictionariesLoaded) return;
    this.dictionariesLoaded = true;
    try {
      await this.store.loadDictionaries();
    } catch {
      this.dictionariesLoaded = false; // allow retry on next shell init
    }
  }

  /** Aborts the active SSE flow (called on route leave from idp-shell onDestroy). */
  cancelActiveStream(): void {
    this.activeStreamController?.abort();
    this.activeStreamController = null;
  }

  // --- SSE Event Handler ---
  private handleSseEvent(event: SseEvent): void {
    const payload = event.data;

    switch (payload.type) {
      case 'STAGE_UPDATE': {
        // Backend is the source of truth; currentStepNumber derives from it.
        this.store.setStage(payload.stage);
        break;
      }
      case 'MESSAGE_DELTA': {
        const messageId = payload.messageId;
        if (this.store.currentStreamingMessageId() === messageId) {
          this.store.updateStreamingMessage(messageId, payload.delta);
        } else {
          this.store.addChatMessage({
            id: messageId,
            role: 'assistant',
            content: payload.delta,
            createdAt: new Date().toISOString(),
          });
          this.store.setStreaming(true, messageId);
        }
        break;
      }
      case 'QUESTIONNAIRE_READY': {
        this.store.setSkills(payload.skills);
        break;
      }
      case 'PLAN_DRAFT_UPDATE': {
        const update = payload as PlanDraftUpdatePayload & { validationErrors?: string[] };
        this.store.setDraft(update.plan);
        // План пришёл с сервера целиком: ошибки предыдущих промежуточных
        // состояний (пока диалог заполнял план) больше не актуальны.
        this.store.setValidationErrors(update.validationErrors ?? []);
        break;
      }
      case 'DIALOG_STATE': {
        this.store.setDialogState(
          payload.active,
          payload.step,
          payload.answered,
          payload.total,
          payload.suggestions ?? []
        );
        break;
      }
      case 'DONE': {
        this.store.setStreaming(false);
        break;
      }
      case 'ERROR': {
        this.streamErrorSurfaced = true;
        this.store.setStreaming(false);
        this.store.addChatMessage(
          this.buildMessage('assistant', this.streamErrorMessage(payload.code, payload.message))
        );
        break;
      }
    }
  }

  /**
   * Awaits a single httpResource mutation. Mirrors the private helper in
   * IdpStoreService; kept here so dev-only mock-control calls can live in the
   * workflow layer without exposing store internals.
   */
  private awaitResource<T>(createRef: () => HttpResourceRef<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      runInInjectionContext(this.injector, () => {
        const ref = createRef();
        let effectRef: ReturnType<typeof effect> | undefined;
        const settle = () => {
          effectRef?.destroy();
          untracked(() => ref.destroy());
        };
        effectRef = effect(() => {
          const status = ref.status();
          if (status === 'resolved' || status === 'local') {
            const value = ref.value();
            settle();
            resolve(value);
          } else if (status === 'error') {
            const error = ref.error();
            settle();
            reject(toApiError(error));
          }
        });
      });
    });
  }

  // --- Stream plumbing ---
  private async consumeStream(
    create: (signal: AbortSignal) => AsyncGenerator<SseEvent, void, unknown>,
    options?: { redirectOnContextIncomplete?: boolean }
  ): Promise<void> {
    this.cancelActiveStream();
    const controller = new AbortController();
    this.activeStreamController = controller;
    this.streamErrorSurfaced = false;
    this.store.setStreaming(true);

    try {
      for await (const event of create(controller.signal)) {
        this.handleSseEvent(event);
      }
    } catch (error) {
      // Aborted streams end the generator gracefully (SseService returns on
      // signal.aborted); when an ERROR event was delivered it was already
      // surfaced as an assistant message above.
      if (controller.signal.aborted) {
        // no-op graceful abort
      } else if (
        options?.redirectOnContextIncomplete &&
        error instanceof SseConnectError &&
        error.apiError.code === 'context_incomplete'
      ) {
        // C3: init-assessment can fail with 409 context_incomplete when the
        // workflow is still at stage 1.x. Send the user to onboarding and
        // explain why the questionnaire never started.
        this.store.addChatMessage(
          this.buildMessage('assistant', this.streamErrorMessage(error.apiError.code, error.apiError.message))
        );
        void this.router.navigate(['/idp/onboarding']);
      } else if (!this.streamErrorSurfaced) {
        // Pre-stream failures (401/409/422) carry a typed ApiError with the
        // backend `error` code + message: surface them instead of one generic
        // line so the user can tell an expired session from a missing draft.
        const assistantMessage =
          error instanceof SseConnectError
            ? this.streamErrorMessage(error.apiError.code, error.apiError.message)
            : 'Не удалось обработать запрос. Попробуйте снова.';
        this.store.addChatMessage(this.buildMessage('assistant', assistantMessage));
      }
    } finally {
      // Only finalize if this stream is still the active one (a replacement
      // flow may have started right after the abort).
      if (this.activeStreamController === controller) {
        this.store.setStreaming(false);
        this.activeStreamController = null;
      }
    }
  }

  /**
   * Code-specific user-facing error text. `code` comes from the SSE ERROR
   * payload (`payload.code`) or the pre-stream 4xx `ApiError.code`; the
   * backend `message` is used verbatim when it is informative.
   */
  private streamErrorMessage(code: string | undefined, message: string | undefined): string {
    const backendMessage = message?.trim() ?? '';
    switch (code) {
      case 'context_incomplete':
        return 'Контекст задан неполностью — укажите должности.';
      case 'draft_missing':
        return 'Черновик плана не найден. Сначала сгенерируйте черновик.';
      case 'validation_error':
        return backendMessage
          ? `Данные не прошли проверку: ${backendMessage}`
          : 'Данные не прошли проверку. Проверьте оценки и параметры плана.';
      case 'unauthorized':
      case 'UNAUTHORIZED':
      case 'HTTP_401':
        return 'Сессия истекла. Войдите снова и повторите действие.';
      case 'LLM_TIMEOUT':
        return 'Модель не ответила вовремя. Попробуйте снова.';
      default:
        return backendMessage
          ? `Ошибка: ${backendMessage}`
          : 'Не удалось обработать запрос. Попробуйте снова.';
    }
  }

  private buildMessage(role: ChatMessage['role'], content: string): ChatMessage {
    return {
      id: crypto.randomUUID(),
      role,
      content,
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Dev-only scenario switch. POSTs /mock/scenario, then re-initializes the
   * session entirely through the existing backend-driven paths:
   * clearSession → loadContext → loadDictionariesOnce. Stage/context/skills
   * are never invented here; they come from backend responses / SSE.
   */
  async switchScenario(scenario: Scenario): Promise<void> {
    this.cancelActiveStream();
    this.store.clearSession();
    this.contextLoaded = false;
    // Drop the previous in-flight handle: the scenario switch must issue a
    // fresh load instead of awaiting the pre-switch response.
    this.contextPromise = null;
    this.dictionariesLoaded = false;
    await this.awaitResource(() => this.api.setScenario(scenario));
    await this.loadContext();
    await this.loadDictionariesOnce();
  }
}
