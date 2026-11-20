import type { EmployeeContext, Scenario, SkillAssessmentItem } from '../types.js';
import { DIRECTION, TOOL } from './dictionaries.js';

export interface MockUser {
  username: string;
  password: string;
  sub: string;
  name: string;
  email: string;
  roles: string[];
}

/**
 * Демо-пользователи мок-Keycloak.
 * Пароли намеренно простые: это локальный мок, не production.
 */
export const MOCK_USERS: readonly MockUser[] = [
  {
    username: 'demo',
    password: 'demo',
    sub: 'emp-001',
    name: 'Константинопольских К.',
    email: 'demo@compass.local',
    roles: ['employee'],
  },
  {
    username: 'hr',
    password: 'hr',
    sub: 'hr-001',
    name: 'Кордеболеткина Кордебалетта Кордеболетовна',
    email: 'hr@compass.local',
    roles: ['hr'],
  },
];

export const DEMO_MANAGER = 'Кордеболеткина Кордебалетта Кордеболетовна';

export function findUserByCredentials(username: string, password: string): MockUser | undefined {
  return MOCK_USERS.find((user) => user.username === username && user.password === password);
}

export function findUserBySubject(sub: string): MockUser | undefined {
  return MOCK_USERS.find((user) => user.sub === sub);
}

export function buildContext(
  employeeId: string,
  fullName: string,
  scenario: Scenario,
  returnUrl: string,
): EmployeeContext {
  const known = scenario === 'known_employee';
  return {
    employeeId,
    fullName,
    managerFullName: DEMO_MANAGER,
    hasActiveIdpWarning: known,
    currentPosition: known ? 'Middle Frontend Developer' : null,
    targetPosition: known ? 'Senior Frontend Developer' : null,
    returnUrl,
    isNewEmployee: !known,
  };
}

interface SkillSeed extends SkillAssessmentItem {
  direction: string;
  tool: string;
}

const FRONTEND_SKILLS: readonly SkillSeed[] = [
  {
    skillId: 'skill-spa-architecture',
    skillName: 'Проектирование архитектуры SPA',
    description: 'Слои приложения, границы модулей, state management, масштабирование кодовой базы.',
    rating: null,
    direction: DIRECTION.tooling,
    tool: TOOL.courses,
  },
  {
    skillId: 'skill-performance',
    skillName: 'Оптимизация производительности и Web Vitals',
    description: 'Профилирование, бюджеты бандла, ленивые загрузки, метрики LCP/INP/CLS.',
    rating: null,
    direction: DIRECTION.quality,
    tool: TOOL.workplace,
  },
  {
    skillId: 'skill-mentoring',
    skillName: 'Менторство и код-ревью',
    description: 'Обратная связь, ревью как обучение, передача знаний команде.',
    rating: null,
    direction: DIRECTION.management,
    tool: TOOL.others,
  },
  {
    skillId: 'skill-cicd',
    skillName: 'Работа с CI/CD и Docker',
    description: 'Пайплайны сборки, контейнеризация фронтенда, деплой и откаты.',
    rating: null,
    direction: DIRECTION.tooling,
    tool: TOOL.courses,
  },
];

const QA_SKILLS: readonly SkillSeed[] = [
  {
    skillId: 'skill-test-design',
    skillName: 'Проектирование тестов',
    description: 'Тест-дизайн, чек-листы, приоритизация регрессии.',
    rating: null,
    direction: DIRECTION.quality,
    tool: TOOL.courses,
  },
  {
    skillId: 'skill-automation',
    skillName: 'Автоматизация тестирования',
    description: 'E2E и API-автотесты, стабильность и скорость прогонов.',
    rating: null,
    direction: DIRECTION.tooling,
    tool: TOOL.workplace,
  },
  {
    skillId: 'skill-quality-process',
    skillName: 'Процессы обеспечения качества',
    description: 'Метрики качества, работа с дефектами, встроенность в SDLC.',
    rating: null,
    direction: DIRECTION.speed,
    tool: TOOL.others,
  },
  {
    skillId: 'skill-communication',
    skillName: 'Коммуникация с командой и заказчиком',
    description: 'Прозрачность статусов, работа с ожиданиями, разбор инцидентов.',
    rating: null,
    direction: DIRECTION.personal,
    tool: TOOL.others,
  },
];

const GENERIC_SKILLS: readonly SkillSeed[] = [
  {
    skillId: 'skill-domain',
    skillName: 'Знание предметной области',
    description: 'Понимание процессов, продуктов и ролей в подразделении.',
    rating: null,
    direction: DIRECTION.products,
    tool: TOOL.workplace,
  },
  {
    skillId: 'skill-tools',
    skillName: 'Владение инструментарием',
    description: 'Рабочие инструменты и технологии, необходимые на целевой позиции.',
    rating: null,
    direction: DIRECTION.tooling,
    tool: TOOL.courses,
  },
  {
    skillId: 'skill-teamwork',
    skillName: 'Командное взаимодействие',
    description: 'Договорённости, обратная связь, совместная работа над задачами.',
    rating: null,
    direction: DIRECTION.personal,
    tool: TOOL.others,
  },
  {
    skillId: 'skill-ownership',
    skillName: 'Самостоятельность и ответственность',
    description: 'Планирование, доведение задач до результата, работа с рисками.',
    rating: null,
    direction: DIRECTION.management,
    tool: TOOL.workplace,
  },
];

export interface SkillCatalog {
  skills: SkillAssessmentItem[];
  meta: Map<string, { direction: string; tool: string }>;
}

/** Набор навыков зависит от целевой должности: фронт / QA / остальные. */
export function buildSkillCatalog(targetPosition: string | null): SkillCatalog {
  const target = (targetPosition ?? '').toLowerCase();
  const seeds = target.includes('qa') || target.includes('тест')
    ? QA_SKILLS
    : target.includes('frontend') || target.includes('фронт') || target.includes('front')
      ? FRONTEND_SKILLS
      : GENERIC_SKILLS;

  return {
    skills: seeds.map(({ direction: _direction, tool: _tool, ...skill }) => ({ ...skill })),
    meta: new Map(seeds.map((seed) => [seed.skillId, { direction: seed.direction, tool: seed.tool }])),
  };
}
