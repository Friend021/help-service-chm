import { Injectable, signal, computed, inject, Injector, effect, untracked, runInInjectionContext } from '@angular/core';
import { HttpResourceRef } from '@angular/common/http';
import { ApiClientService } from '../api/api-client.service';
import { ApiError, toApiError } from '../api/api-error';
import {
  EmployeeContext,
  EmployeeContextResponse,
  SkillAssessmentItem,
  IdpPlan,
  IdpPlanDraft,
  IdpDraftResponse,
  IdpDirection,
  IdpTask,
  ChatMessage,
  WorkflowStage,
  DevelopmentDirection,
  DevelopmentTool,
  PriorityOption,
  StageLabel,
  TargetPosition,
  ExportResponse,
  ValidationError,
  Scenario,
} from '../../models/idp.models';

/**
 * Upper bound for a single API resource to settle. A hung request would keep
 * `awaitResource` pending forever and leak its effect + resource (D-3r #14).
 */
const RESOURCE_TIMEOUT_MS = 12_000;

/** Response shape of POST /chat/confirm (mirrors openapi ConfirmResponse). */
export interface ConfirmPlanResponse {
  stage: WorkflowStage;
  plan: IdpPlan;
  isValid: boolean;
  validationErrors: string[];
  priorities: Array<{ goal: string; rank: number; label: string }>;
}

@Injectable({ providedIn: 'root' })
export class IdpStoreService {
  private readonly api = inject(ApiClientService);
  private readonly injector = inject(Injector);

  // --- Core State ---
  readonly currentStage = signal<WorkflowStage>('STAGE_1_CONTEXT');
  readonly context = signal<EmployeeContext | null>(null);
  readonly contextError = signal<ApiError | null>(null);
  readonly scenario = signal<Scenario>('known_employee');

  // --- Skills Assessment ---
  readonly skills = signal<SkillAssessmentItem[]>([]);
  readonly ratings = signal<Map<string, number>>(new Map());
  // Свободный текст: какие рабочие задачи сотрудник планирует выполнять, чтобы
  // развиваться. Едет в generate-draft и учитывается в промпте генерации ИПР.
  readonly plannedTasks = signal<string>('');

  // --- Draft Plan ---
  readonly draft = signal<IdpPlan>({ mainGoal: '', directions: [] });
  readonly draftResponse = signal<IdpDraftResponse | null>(null);
  readonly validationErrors = signal<ValidationError[]>([]);
  readonly exportedAt = signal<string | null>(null);

  // --- Saved snapshot (normalized) for explicit-save dirty tracking ---
  #savedSnapshot = this.#snapshot({ mainGoal: '', directions: [] });
  readonly isDirty = computed(() => this.#snapshot(this.draft()) !== this.#savedSnapshot);

  // --- Chat ---
  readonly messages = signal<ChatMessage[]>([]);
  readonly isStreaming = signal(false);
  readonly currentStreamingMessageId = signal<string | null>(null);

  // --- Dialog (пошаговое заполнение ИПР) ---
  readonly dialogActive = signal(false);
  readonly dialogStep = signal<string>('goal');
  readonly dialogAnswered = signal(0);
  readonly dialogTotal = signal(5);
  readonly dialogSuggestions = signal<string[]>([]);

  // --- Dictionaries ---
  readonly directions = signal<DevelopmentDirection[]>([]);
  readonly tools = signal<DevelopmentTool[]>([]);
  readonly priorities = signal<PriorityOption[]>([]);
  readonly stageLabels = signal<StageLabel[]>([]);
  readonly targetRoles = signal<string[]>([]);
  readonly targetPositions = signal<TargetPosition[]>([]);

  // --- Computed ---
  readonly isDraftValid = computed(() => this.validationErrors().length === 0);
  readonly directionsCount = computed(() => this.draft().directions.length);
  readonly tasksCount = computed(() =>
    this.draft().directions.reduce((sum, d) => sum + d.tasks.length, 0)
  );
  readonly weakSkills = computed(() =>
    this.skills().filter(s => (s.rating ?? 5) < 4)
  );
  readonly allSkillsRated = computed(() =>
    this.skills().length > 0 && this.skills().every(s => s.rating !== null)
  );
  readonly currentStepNumber = computed(() => {
    const stage = this.currentStage();
    const labels = this.stageLabels();
    const found = labels.find(l => l.stage === stage);
    return found?.stepNumber ?? 1;
  });
  readonly totalSteps = computed(() => this.stageLabels()[0]?.totalSteps ?? 5);

  // --- Async plumbing ---

  /**
   * Monotonic sequence counter guarding overlapping (debounced) PUT saves.
   * `updateDraftPlan` captures it before awaiting; a result whose seq no longer
   * matches the latest call is stale and must not mutate any state.
   */
  #saveSeq = 0;

  /**
   * Runs an ApiClientService resource factory and awaits its completion as a
   * native Promise. httpResource resources expose only signals (no value$/error$
   * streams in Angular 22), so completion is observed via an `effect` on
   * `status()`. The effect and the resource are destroyed once settled — also
   * when the request hangs and the timeout below fires.
   */
  private awaitResource<T>(createRef: () => HttpResourceRef<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      runInInjectionContext(this.injector, () => {
        const ref = createRef();
        let effectRef: ReturnType<typeof effect> | undefined;
        let settled = false;
        const teardown = () => {
          effectRef?.destroy();
          untracked(() => ref.destroy());
        };
        // Timeout guard (D-3r #14): a hung request never flips status(), so
        // without it the effect + resource would leak and the caller would
        // await forever. `settle()` clears the timer on every normal path.
        const timer = setTimeout(() => {
          if (settled) return;
          settled = true;
          teardown();
          reject({
            code: 'TIMEOUT',
            message: 'Сервер не ответил вовремя. Попробуйте ещё раз.',
          } satisfies ApiError);
        }, RESOURCE_TIMEOUT_MS);
        /** Returns false when the promise already settled (timeout won the race). */
        const settle = (): boolean => {
          if (settled) return false;
          settled = true;
          clearTimeout(timer);
          teardown();
          return true;
        };
        effectRef = effect(() => {
          const status = ref.status();
          if (status === 'resolved' || status === 'local') {
            const value = ref.value();
            if (settle()) resolve(value);
          } else if (status === 'error') {
            const error = ref.error();
            if (settle()) reject(toApiError(error));
          }
        });
      });
    });
  }

  /** Mirror the backend-reported stage into the stage signal (backend is source of truth). */
  private mirrorStage(stage: WorkflowStage | undefined | null): void {
    if (stage) this.currentStage.set(stage);
  }

  /**
   * Normalized JSON snapshot of the plan. Only the fields rendered in the draft
   * editor are included, so server-only metadata does not affect dirty state.
   */
  #snapshot(plan: IdpPlan): string {
    return JSON.stringify({
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
          commentAuthor: t.commentAuthor,
          commentCreatedAt: t.commentCreatedAt,
        })),
      })),
    });
  }

  // --- Context Actions (real API flows) ---

  /**
   * GET /session/context via ApiClientService. Stores the context and mirrors
   * the response stage. On ApiError stores null context + error signal and
   * rethrows.
   */
  async loadContext(scenario?: Scenario): Promise<EmployeeContextResponse> {
    try {
      const response = await this.awaitResource(() => this.api.getContext(scenario));
      this.context.set(response.context);
      this.scenario.set(
        response.scenario ??
          (response.context?.isNewEmployee ? 'new_employee' : 'known_employee')
      );
      this.mirrorStage(response.stage);
      this.contextError.set(null);
      return response;
    } catch (err) {
      const apiError = toApiError(err);
      this.context.set(null);
      this.contextError.set(apiError);
      throw apiError;
    }
  }

  /**
   * POST /session/context/manual via ApiClientService. Stores the context and
   * mirrors the response stage. Rejects with ApiError on failure (e.g. 422).
   */
  async submitManualContext(
    currentPosition: string,
    targetPosition: string
  ): Promise<EmployeeContextResponse> {
    try {
      const response = await this.awaitResource(
        () => this.api.setManualContext({ currentPosition, targetPosition })
      );
      this.context.set(response.context);
      this.mirrorStage(response.stage);
      this.contextError.set(null);
      // Целевая роль могла смениться — сбрасываем набор навыков и оценки,
      // чтобы опросник перегрузился под новую роль (иначе показывается старый).
      this.skills.set([]);
      this.ratings.set(new Map());
      return response;
    } catch (err) {
      const apiError = toApiError(err);
      this.contextError.set(apiError);
      throw apiError;
    }
  }

  setContext(context: EmployeeContext): void {
    this.context.set(context);
    this.scenario.set(context.isNewEmployee ? 'new_employee' : 'known_employee');
  }

  updateContext(partial: Partial<EmployeeContext>): void {
    this.context.update(current => current ? { ...current, ...partial } : null);
  }

  // --- Stage Navigation ---
  setStage(stage: WorkflowStage): void {
    this.currentStage.set(stage);
  }

  // --- Skills Actions ---
  /**
   * (Re-)initializes the skills list while preserving user ratings (M7):
   * ratings for skill ids present in both the old and new list survive;
   * ratings for removed ids are dropped, new ids start unrated. An incoming
   * item's own rating seeds the map when nothing was stored for it locally.
   */
  setSkills(skills: SkillAssessmentItem[]): void {
    const previousRatings = this.ratings();
    this.skills.set(skills);
    const next = new Map<string, number>();
    for (const s of skills) {
      const preserved = previousRatings.get(s.skillId);
      if (preserved !== undefined) {
        next.set(s.skillId, preserved);
      } else if (s.rating != null) {
        next.set(s.skillId, s.rating);
      }
    }
    this.ratings.set(next);
  }

  updateRating(skillId: string, rating: number): void {
    this.ratings.update(map => new Map(map).set(skillId, rating));
    // Also update the skill object
    this.skills.update(skills =>
      skills.map(s => (s.skillId === skillId ? { ...s, rating } : s))
    );
  }

  getRating(skillId: string): number | undefined {
    return this.ratings().get(skillId);
  }

  // --- Dictionaries (real API flow) ---

  /** GET /idp/dictionaries — stores directions/priorities/developmentTools/stages. */
  async loadDictionaries(): Promise<void> {
    const response = await this.awaitResource(() => this.api.getDictionaries());
    this.directions.set(response.directions);
    this.tools.set(response.developmentTools);
    this.priorities.set(response.priorities);
    this.stageLabels.set(response.stages);
    this.targetRoles.set(response.targetRoles ?? []);
    this.targetPositions.set(response.targetPositions ?? []);
  }

  setDictionaries(dict: {
    directions: DevelopmentDirection[];
    tools: DevelopmentTool[];
    priorities: PriorityOption[];
    stages: StageLabel[];
  }): void {
    this.directions.set(dict.directions);
    this.tools.set(dict.tools);
    this.priorities.set(dict.priorities);
    this.stageLabels.set(dict.stages);
  }

  // --- Draft Plan (real API flows) ---

  /** GET /idp/draft — hydrate draft response, plan, validation errors and stage. */
  async loadDraft(): Promise<IdpDraftResponse> {
    const response = await this.awaitResource(() => this.api.getDraft());
    this.draftResponse.set(response);
    this.draft.set(response.plan);
    this.#savedSnapshot = this.#snapshot(response.plan);
    this.setValidationErrors(response.validationErrors ?? []);
    this.exportedAt.set(response.exportedAt);
    this.mirrorStage(response.stage);
    return response;
  }

  /**
   * Hydrate an absent plan from the server exactly once (D-3r finding #3):
   * the stage 3-5 components call this on init so a hard reload no longer
   * renders an empty plan. Guard (documented choice): SKIP the GET whenever a
   * draft already exists in memory — either `draftResponse()` was populated
   * (by an earlier GET, a confirmed PUT or loadDraft) or the plan itself holds
   * content (a session seeded via PLAN_DRAFT_UPDATE). A field-by-field merge
   * was rejected: it would clobber edits from a pending debounced PUT that the
   * server does not know about yet; once a plan exists in memory it already
   * reflects the latest reconciled state. Errors (e.g. 404 while no draft
   * exists yet) are swallowed here — the callers' empty-plan fallbacks suffice.
   */
  async ensureDraftLoaded(): Promise<void> {
    if (this.draftResponse() !== null) return;
    const current = this.draft();
    if (current.mainGoal.trim() !== '' || current.directions.length > 0) return;
    try {
      await this.loadDraft();
    } catch {
      // No draft yet (below stage 3) or transport error — nothing to hydrate.
    }
  }

  /**
   * PUT /idp/draft — persists the merged plan via ApiClientService. Applies the
   * update optimistically, stores the server response, and rolls back the local
   * plan when the request fails (ApiError rethrown).
   *
   * Save sequencing (C2): overlapping debounced saves are guarded by `#saveSeq`.
   * A response from a save that has been superseded is ignored entirely — it
   * must not overwrite the newer plan. A stale failure never rolls back (which
   * would clobber a newer successful state); even a current rollback only fires
   * while the optimistic plan is still the live draft.
   *
   * Stage is NOT mirrored from PUT draft responses (M2): the stage comes from
   * backend SSE STAGE_UPDATE / GET /session/context / the confirm response
   * only, so a later edit after confirm cannot flip the stage mid-completion.
   */
  async updateDraftPlan(plan: IdpPlan | Partial<IdpPlan>): Promise<IdpDraftResponse> {
    const seq = ++this.#saveSeq;
    const previous = this.draft();
    const merged: IdpPlan = {
      ...previous,
      ...plan,
      directions: plan.directions ?? previous.directions,
    };

    // Optimistic local update; rolled back on failure below.
    this.draft.set(merged);

    try {
      const response = await this.awaitResource(() => this.api.updateDraft(merged));
      // Superseded: a newer save owns the state — do not touch it.
      if (seq !== this.#saveSeq) return response;
      this.draftResponse.set(response);
      this.draft.set(response.plan);
      this.#savedSnapshot = this.#snapshot(response.plan);
      this.setValidationErrors(response.validationErrors ?? []);
      this.exportedAt.set(response.exportedAt);
      return response;
    } catch (err) {
      const apiError = toApiError(err);
      // Superseded: never clobber whatever the newer save produced.
      if (seq !== this.#saveSeq) throw apiError;
      if (apiError.validationErrors?.length) {
        this.setValidationErrors(apiError.validationErrors);
      }
      // Roll back only if the optimistic plan is still the live draft.
      if (this.draft() === merged) {
        this.draft.set(previous);
      }
      throw apiError;
    }
  }

  /** POST /chat/confirm — only mirrors the stage when the response provides one. */
  async confirmPlan(plan?: IdpPlanDraft): Promise<ConfirmPlanResponse> {
    const response = await this.awaitResource(() => this.api.confirmPlan(plan));
    this.mirrorStage(response.stage);
    return response;
  }

  /**
   * POST /idp/export — returns { success, returnUrl }; navigation is handled by
   * the caller (workflow/completion component), never here. On ApiError 422 the
   * validation errors are stored, then the error is rethrown.
   */
  async exportPlan(): Promise<ExportResponse> {
    const plan = this.draft();
    try {
      return await this.awaitResource(() => this.api.exportPlan(plan));
    } catch (err) {
      const apiError = toApiError(err);
      if (apiError.validationErrors?.length) {
        this.setValidationErrors(apiError.validationErrors);
      }
      throw apiError;
    }
  }

  setDraft(plan: IdpPlan): void {
    this.draft.set(plan);
    this.#savedSnapshot = this.#snapshot(plan);
  }

  updateDirection(index: number, partial: Partial<IdpDirection>): void {
    this.draft.update(plan => {
      const directions = [...plan.directions];
      if (directions[index]) {
        directions[index] = { ...directions[index], ...partial };
      }
      return { ...plan, directions };
    });
  }

  addDirection(direction: IdpDirection): void {
    this.draft.update(plan => ({
      ...plan,
      directions: [...plan.directions, direction],
    }));
  }

  removeDirection(index: number): void {
    this.draft.update(plan => ({
      ...plan,
      directions: plan.directions.filter((_, i) => i !== index),
    }));
  }

  /**
   * Moves the direction at `from` to position `to` (drag-drop reorder,
   * immutable update). No-op when the indices are equal or out of range.
   * Persisted on the next explicit save (PUT /idp/draft), like all draft edits.
   */
  moveDirection(from: number, to: number): void {
    if (from === to) return;
    this.draft.update(plan => {
      const directions = [...plan.directions];
      if (!Number.isInteger(from) || from < 0 || from >= directions.length) return plan;
      if (to < 0 || to >= directions.length) return plan;
      const moved = directions.splice(from, 1)[0];
      if (!moved) return plan;
      directions.splice(to, 0, moved);
      return { ...plan, directions };
    });
  }

  updateTask(dirIndex: number, taskIndex: number, partial: Partial<IdpTask>): void {
    this.draft.update(plan => {
      const directions = plan.directions.map((d, i) => {
        if (i !== dirIndex) return d;
        return {
          ...d,
          tasks: d.tasks.map((t, j) => (j === taskIndex ? { ...t, ...partial } : t)),
        };
      });
      return { ...plan, directions };
    });
  }

  addTask(dirIndex: number, task: IdpTask): void {
    this.draft.update(plan => {
      const directions = plan.directions.map((d, i) => {
        if (i !== dirIndex) return d;
        return { ...d, tasks: [...d.tasks, task] };
      });
      return { ...plan, directions };
    });
  }

  removeTask(dirIndex: number, taskIndex: number): void {
    this.draft.update(plan => {
      const directions = plan.directions.map((d, i) => {
        if (i !== dirIndex) return d;
        return { ...d, tasks: d.tasks.filter((_, j) => j !== taskIndex) };
      });
      return { ...plan, directions };
    });
  }

  /**
   * Stores validation errors in their structured form ({path, message}).
   * Accepts plain backend strings (draftResponse/PLAN_DRAFT_UPDATE payloads)
   * and normalizes them to objects so the union stays typed.
   */
  setValidationErrors(errors: ValidationError[] | string[]): void {
    this.validationErrors.set(
      errors.map(e =>
        typeof e === 'string' ? { path: 'plan', message: e } : e
      )
    );
  }

  setExportedAt(date: string | null): void {
    this.exportedAt.set(date);
  }

  // --- Chat Actions ---
  addChatMessage(message: ChatMessage): void {
    this.messages.update(msgs => [...msgs, message]);
  }

  /** Legacy alias kept for existing consumers. */
  addMessage(message: ChatMessage): void {
    this.addChatMessage(message);
  }

  updateStreamingMessage(messageId: string, delta: string): void {
    this.messages.update(msgs =>
      msgs.map(m => (m.id === messageId ? { ...m, content: m.content + delta } : m))
    );
  }

  setStreaming(isStreaming: boolean, messageId?: string): void {
    this.isStreaming.set(isStreaming);
    this.currentStreamingMessageId.set(messageId ?? null);
  }

  clearMessages(): void {
    this.messages.set([]);
  }

  /** Состояние диалога приходит из SSE-события DIALOG_STATE. */
  setDialogState(active: boolean, step: string, answered = 0, total = 5, suggestions: string[] = []): void {
    this.dialogActive.set(active);
    this.dialogStep.set(step);
    this.dialogAnswered.set(answered);
    this.dialogTotal.set(total);
    this.dialogSuggestions.set(suggestions);
  }

  // --- Reset ---
  clearSession(): void {
    this.currentStage.set('STAGE_1_CONTEXT');
    this.context.set(null);
    this.contextError.set(null);
    this.scenario.set('known_employee');
    this.skills.set([]);
    this.ratings.set(new Map());
    this.plannedTasks.set('');
    this.draft.set({ mainGoal: '', directions: [] });
    this.#savedSnapshot = this.#snapshot({ mainGoal: '', directions: [] });
    this.draftResponse.set(null);
    this.validationErrors.set([]);
    this.exportedAt.set(null);
    this.directions.set([]);
    this.tools.set([]);
    this.priorities.set([]);
    this.stageLabels.set([]);
    this.messages.set([]);
    this.isStreaming.set(false);
    this.currentStreamingMessageId.set(null);
    this.dialogActive.set(false);
    this.dialogStep.set('goal');
    this.dialogAnswered.set(0);
    this.dialogTotal.set(5);
    this.dialogSuggestions.set([]);
  }

  // --- Serialization (for debugging/dev) ---
  getStateSnapshot() {
    return {
      stage: this.currentStage(),
      context: this.context(),
      scenario: this.scenario(),
      skills: this.skills(),
      ratings: Object.fromEntries(this.ratings()),
      plan: this.draft(),
      errors: this.validationErrors(),
      exportedAt: this.exportedAt(),
      messagesCount: this.messages().length,
    };
  }
}
