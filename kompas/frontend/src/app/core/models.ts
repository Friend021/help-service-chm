export interface Stage {
  code: string;
  title: string;
  index: number;
  total: number;
}

export interface ChatMessage {
  id: number;
  role: 'user' | 'assistant' | string;
  content: string;
  createdAt: string;
}

export interface NamedRef {
  code: string;
  name: string;
  extra?: string | null;
}

export interface Milestone {
  title: string;
  dueDate?: string | null;
  status: string;
}

export interface Priority {
  order: number;
  developmentGoal: string;
  competencies: NamedRef[];
  activities: NamedRef[];
  milestones: Milestone[];
}

export interface Idp {
  id: number;
  date: string;
  status: 'DRAFT' | 'ON_APPROVAL' | 'APPROVED' | 'REJECTED' | string;
  employeeName?: string | null;
  managerName?: string | null;
  currentPosition?: string | null;
  targetRole?: string | null;
  priorities: Priority[];
}

export interface EmployeeInfo {
  externalId: string;
  fullName: string;
  currentPosition?: string | null;
  targetRole?: string | null;
  managerFullName?: string | null;
}

export interface SessionResponse {
  sessionId: number;
  accessToken?: string | null;
  stage: Stage;
  status: string;
  employee: EmployeeInfo;
  messages: ChatMessage[];
  idp?: Idp | null;
}

export interface TurnResponse {
  assistantMessage: string;
  stage: Stage;
  /** Целевая роль после хода — сотрудник мог сменить её в диалоге. */
  targetRole?: string | null;
  idp?: Idp | null;
}

/** Тело ручной правки: приоритеты в «сыром» виде, кодами. */
export interface PriorityPatch {
  order: number;
  developmentGoal: string;
  competencyCodes: string[];
  activityCodes: string[];
  milestones: { title: string; dueDate?: string | null }[];
}
