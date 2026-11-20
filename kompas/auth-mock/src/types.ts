/**
 * Доменные типы мока. Полностью повторяют контракты фронтенда
 * (src/app/core/models/idp.model.ts в будущем SPA).
 */

export type WorkflowStage =
  | 'STAGE_1_CONTEXT'
  | 'STAGE_1_2_ONBOARDING'
  | 'STAGE_2_QUESTIONNAIRE'
  | 'STAGE_3_DRAFT_GEN'
  | 'STAGE_4_REFINEMENT'
  | 'STAGE_5_COMPLETED';

export interface IdpTask {
  /** Инструмент развития, значение из DEVELOPMENT_TOOLS */
  developmentTool: string;
  /** Комментарий для руководителя/наставника, может быть пустым */
  comment: string;
  /** ISO 8601 UTC, например 2026-10-16T07:32:12.162Z */
  deadLine: string;
  /** Что именно предстоит делать */
  description: string;
  /** Имя автора комментария (руководитель/наставник/сотрудник). */
  commentAuthor?: string;
  /** ISO 8601 UTC создания комментария, например 2026-10-16T07:32:12.162Z */
  commentCreatedAt?: string;
}

export interface IdpDirection {
  /** 0 — Высокий, 1 — Средний, 2 — Низкий */
  rank: number;
  /** Направление развития, значение из DEVELOPMENT_DIRECTIONS */
  goal: string;
  /** Что важно развить внутри направления */
  description: string;
  tasks: IdpTask[];
}

export interface IdpPlan {
  mainGoal: string;
  directions: IdpDirection[];
}

/** Тело POST /api/v1/idp/export */
export interface IdpExportRequest {
  plan: IdpPlan;
}

/** Ответ POST /api/v1/idp/export */
export interface IdpExportResponse {
  success: boolean;
  returnUrl: string;
}

export interface EmployeeContext {
  employeeId: string;
  fullName: string;
  managerFullName: string;
  hasActiveIdpWarning: boolean;
  currentPosition: string | null;
  targetPosition: string | null;
  returnUrl: string;
  /** Производный флаг: currentPosition === null */
  isNewEmployee: boolean;
}

export interface SkillAssessmentItem {
  skillId: string;
  skillName: string;
  description: string;
  /** Оценка пользователя 1..5, null пока не выставлена */
  rating: number | null;
}

export type ChatRole = 'assistant' | 'user';

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: string;
}

/** Контракт SSE-событий (стриминг через fetch + ReadableStream) */
export type SseEventPayload =
  | { type: 'STAGE_UPDATE'; stage: WorkflowStage; stepNumber: number; totalSteps: number }
  | { type: 'MESSAGE_DELTA'; messageId: string; delta: string }
  | { type: 'QUESTIONNAIRE_READY'; skills: SkillAssessmentItem[] }
  | { type: 'PLAN_DRAFT_UPDATE'; plan: IdpPlan; validationErrors?: string[] }
  | { type: 'DIALOG_STATE'; active: boolean; step: DialogStep; answered: number; total: number; suggestions?: string[] }
  | { type: 'DONE' }
  | { type: 'ERROR'; message: string };

export type Scenario = 'known_employee' | 'new_employee';

// --- Диалог заполнения ИПР ----------------------------------------------

export type DialogStep = 'goal' | 'direction' | 'focus' | 'actions' | 'more' | 'complete';

/** Состояние пошагового диалога, из которого собирается план. */
export interface DialogState {
  active: boolean;
  step: DialogStep;
  /** Индекс направления, которое сейчас заполняется (-1 до первого). */
  directionIndex: number;
  answered: number;
  total: number;
}

export const TOTAL_STEPS = 5;

export const STAGE_STEP_NUMBER: Record<WorkflowStage, number> = {
  STAGE_1_CONTEXT: 1,
  STAGE_1_2_ONBOARDING: 1,
  STAGE_2_QUESTIONNAIRE: 2,
  STAGE_3_DRAFT_GEN: 3,
  STAGE_4_REFINEMENT: 4,
  STAGE_5_COMPLETED: 5,
};

export function stageUpdate(stage: WorkflowStage): SseEventPayload {
  return {
    type: 'STAGE_UPDATE',
    stage,
    stepNumber: STAGE_STEP_NUMBER[stage],
    totalSteps: TOTAL_STEPS,
  };
}
