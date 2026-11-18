// Mirror of the backend contract from mock-backend/openapi.yaml (source of truth).

// --- Enum-like string unions -------------------------------------------------

export type WorkflowStage =
  | 'STAGE_1_CONTEXT'
  | 'STAGE_1_2_ONBOARDING'
  | 'STAGE_2_QUESTIONNAIRE'
  | 'STAGE_3_DRAFT_GEN'
  | 'STAGE_4_REFINEMENT'
  | 'STAGE_5_COMPLETED';

export type Scenario = 'known_employee' | 'new_employee';

/** event: names streamed over SSE (openapi 3.1 enum values). */
export type SseEventName =
  | 'STAGE_UPDATE'
  | 'MESSAGE_DELTA'
  | 'QUESTIONNAIRE_READY'
  | 'PLAN_DRAFT_UPDATE'
  | 'DIALOG_STATE'
  | 'DONE'
  | 'ERROR';

// Value-domain enums from the dictionaries endpoint (/api/v1/idp/dictionaries).
export type DevelopmentDirection =
  | 'Цели развития не определены/Развитие не требуется'
  | 'Адаптация к должности'
  | 'Повышение объемов производства'
  | 'Увеличение скорости выполнения задач'
  | 'Увеличение качества выполняемых задач'
  | 'Развитие личностных компетенций'
  | 'Развитие управленческих компетенций'
  | 'Кадровый резерв на должность/роль'
  | 'Адаптация к процессам'
  | 'Изучение продуктов'
  | 'Изучение инструментария и технологий';

export type DevelopmentTool =
  | 'Развитие на рабочем месте'
  | 'Развитие через других'
  | 'Развитие через рабочие курсы';

export interface PriorityOption {
  rank: 0 | 1 | 2;
  label: 'Высокий' | 'Средний' | 'Низкий';
}

// --- Core domain schemas -----------------------------------------------------

export interface EmployeeContext {
  employeeId: string;
  fullName: string;
  managerFullName: string;
  hasActiveIdpWarning: boolean;
  currentPosition: string | null;
  targetPosition: string | null;
  returnUrl: string;
  isNewEmployee: boolean;
}

export interface SkillAssessmentItem {
  skillId: string;
  skillName: string;
  description: string;
  /** Self-assessment rating 1..5; null until the employee answers. */
  rating: number | null;
}

export interface IdpTask {
  developmentTool: string;
  comment: string;
  /** ISO 8601 UTC, e.g. 2026-10-16T07:32:12.162Z */
  deadLine: string;
  description: string;
  /** Display name of the manager/employee who wrote the comment. */
  commentAuthor?: string;
  /** ISO 8601 UTC when the comment was written, e.g. 2026-10-16T07:32:12.162Z */
  commentCreatedAt?: string;
}

export interface IdpDirection {
  rank: 0 | 1 | 2;
  goal: string;
  description: string;
  tasks: IdpTask[];
}

export interface IdpPlan {
  mainGoal: string;
  directions: IdpDirection[];
}

// Draft versions (fields can be empty for in-progress editing) — openapi IdpPlanDraft.
export interface IdpTaskDraft {
  developmentTool: string;
  comment: string;
  deadLine: string;
  description: string;
  commentAuthor?: string;
  commentCreatedAt?: string;
}

export interface IdpDirectionDraft {
  rank: number;
  goal: string;
  description: string;
  tasks: IdpTaskDraft[];
}

export interface IdpPlanDraft {
  mainGoal: string;
  directions: IdpDirectionDraft[];
}

export interface ChatMessage {
  id: string;
  role: 'assistant' | 'user';
  content: string;
  createdAt: string;
}

export type ChatRole = 'assistant' | 'user';

// --- API response types ------------------------------------------------------

export interface EmployeeContextResponse {
  context: EmployeeContext;
  scenario: Scenario;
  stage: WorkflowStage;
  isNewEmployee: boolean;
  returnUrl: string;
}

/** GET /api/v1/idp/dictionaries payload. */
export interface DictionariesResponse {
  directions: DevelopmentDirection[];
  priorities: PriorityOption[];
  developmentTools: DevelopmentTool[];
  stages: StageLabel[];
  /** Доступные целевые должности для выбора на шаге подтверждения. */
  targetRoles: string[];
}

export interface StageLabel {
  stage: WorkflowStage;
  stepNumber: number;
  label: string;
  totalSteps: number;
}

/** Shape of the dictionaries panel handed to components (openapi /idp/dictionaries). */
export interface Dictionaries {
  directions: DevelopmentDirection[];
  priorities: PriorityOption[];
  /** dictionaries endpoint (openapi): developmentTools. */
  developmentTools?: DevelopmentTool[];
  /** dictionaries endpoint (openapi): stages. */
  stages?: StageLabel[];
  /** Legacy alias of developmentTools, still consumed by existing components. */
  tools?: DevelopmentTool[];
}

/** GET or PUT /api/v1/idp/draft response. */
export interface IdpDraftResponse {
  stage: WorkflowStage;
  plan: IdpPlan;
  isValid: boolean;
  validationErrors: string[];
  /** Available on GET; null until exported. */
  exportedAt: string | null;
}

/** POST /api/v1/idp/export response (openapi IdpExportResponse). */
export interface ExportResponse {
  success: boolean;
  returnUrl: string;
}

export interface ValidationError {
  path: string;
  message: string;
}

/** Error body used by 4xx responses. */
export interface ApiErrorResponse {
  code: string;
  message: string;
  validationErrors?: ValidationError[];
}

// --- SSE event payloads ------------------------------------------------------

// Note: the `type` discriminant is present in the wire format (openapi examples)
// and kept in the TS payloads so the union stays discriminated.

export interface StageUpdatePayload {
  type: 'STAGE_UPDATE';
  stage: WorkflowStage;
  stepNumber: number;
  totalSteps: number;
}

export interface MessageDeltaPayload {
  type: 'MESSAGE_DELTA';
  messageId: string;
  delta: string;
}

export interface QuestionnaireReadyPayload {
  type: 'QUESTIONNAIRE_READY';
  skills: SkillAssessmentItem[];
}

export interface PlanDraftUpdatePayload {
  type: 'PLAN_DRAFT_UPDATE';
  plan: IdpPlan;
}

/** Состояние пошагового диалога заполнения ИПР. */
export interface DialogStatePayload {
  type: 'DIALOG_STATE';
  active: boolean;
  step: string;
  answered: number;
  total: number;
  /** Варианты ответа, которые чат предлагает пользователю. */
  suggestions?: string[];
}

export interface DonePayload {
  type: 'DONE';
}

export interface ErrorPayload {
  type: 'ERROR';
  code: string;
  message: string;
}

export type SseEventPayload =
  | StageUpdatePayload
  | MessageDeltaPayload
  | QuestionnaireReadyPayload
  | PlanDraftUpdatePayload
  | DialogStatePayload
  | DonePayload
  | ErrorPayload;

export interface SseEvent<T = SseEventPayload> {
  event: SseEventName;
  data: T;
}

// --- Request types -----------------------------------------------------------

export interface RatingRequest {
  skillId: string;
  /** Self-assessment rating 1..5. */
  rating: number;
}

export interface GenerateDraftRequest {
  ratings: RatingRequest[];
}

export interface RefineDraftRequest {
  message: string;
}

export interface ConfirmRequest {
  plan?: IdpPlanDraft;
}

export interface ExportRequest {
  plan: IdpPlan;
}

export interface ManualContextRequest {
  currentPosition: string;
  targetPosition: string;
}
