import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authHeader, createTestApp, eventTypes, firstEvent, getToken, parseSse } from '../test/helpers.js';
import type { IdpPlan, SseEventPayload } from '../types.js';

interface EmployeeContextResponse {
  context: {
    currentPosition: string | null;
    targetPosition: string | null;
    isNewEmployee: boolean;
    fullName: string;
    returnUrl: string;
  };
  scenario: string;
  stage: string;
}

interface QuestionnaireEvent {
  skills: Array<{ skillId: string; skillName: string; rating: number | null }>;
}

function isIso(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value);
}

describe('сценарий ИПР: этапы 1–5', () => {
  let app: FastifyInstance;
  let headers: Record<string, string>;

  beforeAll(async () => {
    app = await createTestApp();
    const { accessToken } = await getToken(app);
    headers = authHeader(accessToken);
  });

  afterAll(async () => {
    await app.close();
  });

  it('ветка 1.1: находит должности и отдаёт контекст', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/session/context', headers });

    expect(response.statusCode).toBe(200);
    const body = response.json<EmployeeContextResponse>();
    expect(body.context.currentPosition).toBe('Middle Frontend Developer');
    expect(body.context.targetPosition).toBe('Senior Frontend Developer');
    expect(body.context.isNewEmployee).toBe(false);
    expect(body.stage).toBe('STAGE_2_QUESTIONNAIRE');
    expect(body.context.returnUrl).toContain('development-plan');
  });

  it('этап 2: стримит приветствие и отдаёт опросник из 4 навыков', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/chat/init-assessment',
      headers,
      payload: {},
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/event-stream');

    const events = parseSse(response.body);
    expect(eventTypes(events)).toContain('QUESTIONNAIRE_READY');
    expect(eventTypes(events).at(-1)).toBe('DONE');

    const questionnaire = firstEvent<QuestionnaireEvent>(events, 'QUESTIONNAIRE_READY');
    expect(questionnaire?.skills).toHaveLength(4);
    expect(questionnaire?.skills.every((skill) => skill.rating === null)).toBe(true);

    const deltas = events.filter((event) => event.event === 'MESSAGE_DELTA');
    expect(deltas.length).toBeGreaterThan(1);
    expect(deltas.every((event) => event.data.messageId === deltas[0]?.data.messageId)).toBe(true);
  });

  it('этап 3: требует оценки всех навыков', async () => {
    const state = await app.inject({ method: 'GET', url: '/mock/state', headers });
    const skills = state.json<{ skills: Array<{ skillId: string }> }>().skills;

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/chat/generate-draft',
      headers,
      payload: { ratings: [{ skillId: skills[0]?.skillId, rating: 2 }] },
    });

    expect(response.statusCode).toBe(422);
    expect(response.json<{ error: string }>().error).toBe('validation_error');
  });

  it('этап 3: генерирует черновик и переводит на этап 4', async () => {
    const state = await app.inject({ method: 'GET', url: '/mock/state', headers });
    const skills = state.json<{ skills: Array<{ skillId: string }> }>().skills;
    const ratings = skills.map((skill, index) => ({ skillId: skill.skillId, rating: index === 0 ? 2 : 5 }));

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/chat/generate-draft',
      headers,
      payload: { ratings },
    });

    expect(response.statusCode).toBe(200);
    const events = parseSse(response.body);
    expect(eventTypes(events)).toContain('PLAN_DRAFT_UPDATE');
    expect(eventTypes(events).at(-1)).toBe('DONE');

    const plan = firstEvent<{ plan: IdpPlan }>(events, 'PLAN_DRAFT_UPDATE')?.plan;
    expect(plan).toBeDefined();
    expect(plan!.mainGoal).toContain('Senior Frontend Developer');
    expect(plan!.directions.length).toBeGreaterThan(0);
    expect(plan!.directions[0]?.rank).toBe(0);
    expect(plan!.directions.every((direction) => direction.tasks.length > 0)).toBe(true);
    expect(plan!.directions.every((direction) => isIso(direction.tasks[0]!.deadLine))).toBe(true);

    const stageEvents = events
      .filter((event) => event.event === 'STAGE_UPDATE')
      .map((event) => (event.data as Extract<SseEventPayload, { type: 'STAGE_UPDATE' }>).stage);
    expect(stageEvents).toContain('STAGE_3_DRAFT_GEN');
    expect(stageEvents.at(-1)).toBe('STAGE_4_REFINEMENT');

    const draft = await app.inject({ method: 'GET', url: '/api/v1/idp/draft', headers });
    expect(draft.json<{ stage: string }>().stage).toBe('STAGE_4_REFINEMENT');
  });

  it('этап 4: корректирует план по сообщению и остаётся в цикле', async () => {
    const before = (await app.inject({ method: 'GET', url: '/api/v1/idp/draft', headers })).json<{ plan: IdpPlan }>().plan;
    const tasksBefore = before.directions.reduce((sum, direction) => sum + direction.tasks.length, 0);

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/chat/refine-draft',
      headers,
      payload: { message: 'Добавь задачу по изучению микрофронтендов с высоким приоритетом и сдвинь дедлайн на декабрь 2026' },
    });

    expect(response.statusCode).toBe(200);
    const events = parseSse(response.body);
    const updated = firstEvent<{ plan: IdpPlan }>(events, 'PLAN_DRAFT_UPDATE')?.plan;
    expect(updated).toBeDefined();

    const tasksAfter = updated!.directions.reduce((sum, direction) => sum + direction.tasks.length, 0);
    expect(tasksAfter).toBe(tasksBefore + 1);
    expect(updated!.directions[0]?.rank).toBe(0);
    expect(updated!.directions[0]?.tasks.every((task) => task.deadLine.startsWith('2026-12'))).toBe(true);

    const state = await app.inject({ method: 'GET', url: '/mock/state', headers });
    expect(state.json<{ stage: string }>().stage).toBe('STAGE_4_REFINEMENT');
    expect(state.json<{ chatMessages: number }>().chatMessages).toBeGreaterThan(0);
  });

  it('этап 5: подтверждение переводит на STAGE_5_COMPLETED', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/chat/confirm',
      headers,
      payload: {},
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{ stage: string; isValid: boolean }>();
    expect(body.stage).toBe('STAGE_5_COMPLETED');
    expect(body.isValid).toBe(true);
  });

  it('экспорт: отклоняет невалидный контракт и показывает пути ошибок', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/idp/export',
      headers,
      payload: {
        plan: {
          mainGoal: '',
          directions: [
            {
              rank: 7,
              goal: 'Несуществующее направление',
              description: '',
              tasks: [{ developmentTool: 'Курс', comment: '', deadLine: '2026-13-99', description: '' }],
            },
          ],
        },
      },
    });

    expect(response.statusCode).toBe(422);
    const body = response.json<{ errors: Array<{ path: string }> }>();
    expect(body.errors.some((issue) => issue.path.startsWith('plan.mainGoal'))).toBe(true);
    expect(body.errors.some((issue) => issue.path.includes('directions.0.rank'))).toBe(true);
    expect(body.errors.some((issue) => issue.path.includes('deadLine'))).toBe(true);
  });

  it('экспорт: принимает валидный план и возвращает returnUrl', async () => {
    const draft = (await app.inject({ method: 'GET', url: '/api/v1/idp/draft', headers })).json<{ plan: IdpPlan }>().plan;

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/idp/export',
      headers,
      payload: { plan: draft },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{ success: boolean; returnUrl: string }>();
    expect(body.success).toBe(true);
    expect(body.returnUrl).toContain('development-plan');

    const state = await app.inject({ method: 'GET', url: '/mock/state', headers });
    expect(state.json<{ stage: string; exportedAt: string | null }>().stage).toBe('STAGE_5_COMPLETED');
    expect(state.json<{ exportedAt: string | null }>().exportedAt).not.toBeNull();
  });

  it('сохраняет ручные правки через PUT /idp/draft', async () => {
    const current = (await app.inject({ method: 'GET', url: '/api/v1/idp/draft', headers })).json<{ plan: IdpPlan }>().plan;
    const edited: IdpPlan = structuredClone(current);
    edited.mainGoal = 'Вручную изменённая цель';

    const response = await app.inject({
      method: 'PUT',
      url: '/api/v1/idp/draft',
      headers,
      payload: { plan: edited },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json<{ plan: IdpPlan }>().plan.mainGoal).toBe('Вручную изменённая цель');
  });
});

describe('ветка 1.2: новый сотрудник', () => {
  let app: FastifyInstance;
  let headers: Record<string, string>;

  beforeAll(async () => {
    app = await createTestApp();
    const { accessToken } = await getToken(app);
    headers = authHeader(accessToken);
  });

  afterAll(async () => {
    await app.close();
  });

  it('переключает сценарий и отдаёт пустые должности', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/mock/scenario',
      headers,
      payload: { scenario: 'new_employee' },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{ scenario: string; stage: string; context: { isNewEmployee: boolean } }>();
    expect(body.scenario).toBe('new_employee');
    expect(body.stage).toBe('STAGE_1_2_ONBOARDING');
    expect(body.context.isNewEmployee).toBe(true);
  });

  it('не запускает опросник без целевой должности', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/chat/init-assessment',
      headers,
      payload: {},
    });

    expect(response.statusCode).toBe(409);
    expect(response.json<{ error: string }>().error).toBe('context_incomplete');
  });

  it('после ручного ввода должностей переходит на этап 2', async () => {
    const manual = await app.inject({
      method: 'POST',
      url: '/api/v1/session/context/manual',
      headers,
      payload: { currentPosition: 'Junior QA', targetPosition: 'Middle QA' },
    });

    expect(manual.statusCode).toBe(200);
    const body = manual.json<{ stage: string; context: { currentPosition: string; targetPosition: string } }>();
    expect(body.stage).toBe('STAGE_2_QUESTIONNAIRE');
    expect(body.context.targetPosition).toBe('Middle QA');

    const questionnaire = await app.inject({
      method: 'POST',
      url: '/api/v1/chat/init-assessment',
      headers,
      payload: {},
    });

    expect(questionnaire.statusCode).toBe(200);
    const skills = firstEvent<QuestionnaireEvent>(parseSse(questionnaire.body), 'QUESTIONNAIRE_READY')?.skills;
    expect(skills?.[0]?.skillName).toBe('Проектирование тестов');
  });

  it('валидирует пустые должности', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/session/context/manual',
      headers,
      payload: { currentPosition: '  ', targetPosition: '' },
    });

    expect(response.statusCode).toBe(422);
  });
});
