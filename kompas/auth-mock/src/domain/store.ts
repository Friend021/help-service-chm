import { randomUUID } from 'node:crypto';
import type { ChatMessage, ChatRole, DialogState, EmployeeContext, IdpPlan, Scenario, SkillAssessmentItem, WorkflowStage } from '../types.js';
import { emptyDialogState } from './dialog.js';
import { buildContext } from './seed.js';

export interface SessionState {
  subjectId: string;
  subjectName: string;
  scenario: Scenario;
  context: EmployeeContext;
  stage: WorkflowStage;
  skills: SkillAssessmentItem[];
  plan: IdpPlan;
  chat: ChatMessage[];
  /** Состояние пошагового диалога заполнения ИПР. */
  dialog: DialogState;
  exportedAt: string | null;
  updatedAt: string;
}

export function emptyPlan(): IdpPlan {
  return { mainGoal: '', directions: [] };
}

/**
 * In-memory хранилище сессий. Ключ — `sub` из JWT.
 * Ничего не персистится: рестарт = чистое состояние.
 */
export class SessionStore {
  private readonly sessions = new Map<string, SessionState>();

  constructor(
    private readonly returnUrl: string,
    private readonly now: () => Date = () => new Date(),
  ) {}

  get(subjectId: string, subjectName: string): SessionState {
    const existing = this.sessions.get(subjectId);
    if (existing) {
      if (subjectName && existing.subjectName !== subjectName) {
        existing.subjectName = subjectName;
      }
      return existing;
    }

    const session: SessionState = {
      subjectId,
      subjectName: subjectName || 'Сотрудник',
      scenario: 'known_employee',
      context: buildContext(subjectId, subjectName || 'Сотрудник', 'known_employee', this.returnUrl),
      stage: 'STAGE_2_QUESTIONNAIRE',
      skills: [],
      plan: emptyPlan(),
      chat: [],
      dialog: emptyDialogState(),
      exportedAt: null,
      updatedAt: this.now().toISOString(),
    };
    this.sessions.set(subjectId, session);
    return session;
  }

  setScenario(subjectId: string, subjectName: string, scenario: Scenario): SessionState {
    const session = this.get(subjectId, subjectName);
    session.scenario = scenario;
    session.context = buildContext(session.subjectId, session.subjectName, scenario, this.returnUrl);
    session.stage = scenario === 'known_employee' ? 'STAGE_2_QUESTIONNAIRE' : 'STAGE_1_2_ONBOARDING';
    session.skills = [];
    session.plan = emptyPlan();
    session.chat = [];
    session.dialog = emptyDialogState();
    session.exportedAt = null;
    session.updatedAt = this.now().toISOString();
    return session;
  }

  resetAll(): void {
    this.sessions.clear();
  }

  addChatMessage(session: SessionState, role: ChatRole, content: string, id = randomUUID()): ChatMessage {
    const message: ChatMessage = {
      id,
      role,
      content,
      createdAt: this.now().toISOString(),
    };
    session.chat.push(message);
    session.updatedAt = message.createdAt;
    return message;
  }

  touch(session: SessionState, stage?: WorkflowStage): void {
    if (stage) session.stage = stage;
    session.updatedAt = this.now().toISOString();
  }

  planSnapshot(session: SessionState): IdpPlan {
    return structuredClone(session.plan);
  }

  setSkills(session: SessionState, skills: SkillAssessmentItem[]): void {
    session.skills = skills;
  }
}
