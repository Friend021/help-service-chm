import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authHeader, createTestApp, firstEvent, getToken, parseSse } from '../test/helpers.js';
import type { IdpPlan } from '../types.js';

interface DialogStateEvent {
  active: boolean;
  step: string;
  answered: number;
  total: number;
}

interface PlanEvent {
  plan: IdpPlan;
}

describe('диалог заполнения ИПР', () => {
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

  async function turn(message?: string) {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/chat/dialog',
      headers,
      payload: message ? { message } : {},
    });
    expect(response.statusCode).toBe(200);
    return parseSse(response.body);
  }

  it('ведёт по шагам и наполняет план из ответов', async () => {
    const start = await turn();
    const startState = firstEvent<DialogStateEvent & { suggestions?: string[] }>(start, 'DIALOG_STATE');
    expect(startState).toMatchObject({ active: true, step: 'goal', answered: 0, total: 5 });
    expect(startState?.suggestions).toContain('Вырасти до Senior');
    expect(firstEvent<{ delta: string }>(start, 'MESSAGE_DELTA')?.delta).toBeTruthy();

    const goal = await turn('Вырасти до Senior Frontend Developer');
    expect(firstEvent<DialogStateEvent>(goal, 'DIALOG_STATE')).toMatchObject({ step: 'direction' });
    expect(firstEvent<PlanEvent>(goal, 'PLAN_DRAFT_UPDATE')?.plan.mainGoal).toBe(
      'Вырасти до Senior Frontend Developer',
    );

    const direction = await turn('управленческие компетенции');
    expect(firstEvent<DialogStateEvent>(direction, 'DIALOG_STATE')).toMatchObject({ step: 'focus' });
    expect(firstEvent<PlanEvent>(direction, 'PLAN_DRAFT_UPDATE')?.plan.directions[0]?.goal).toBe(
      'Развитие управленческих компетенций',
    );

    const focus = await turn('делегирование и обратная связь');
    expect(firstEvent<DialogStateEvent>(focus, 'DIALOG_STATE')).toMatchObject({ step: 'actions' });

    const actions = await turn('пройти курс по TypeScript, взять наставника');
    expect(firstEvent<DialogStateEvent>(actions, 'DIALOG_STATE')).toMatchObject({ step: 'more' });
    const filled = firstEvent<PlanEvent>(actions, 'PLAN_DRAFT_UPDATE')?.plan;
    expect(filled?.directions[0]?.description).toBe('делегирование и обратная связь');
    expect(filled?.directions[0]?.tasks).toHaveLength(2);
    expect(filled?.directions[0]?.tasks[0]?.developmentTool).toBe('Развитие через рабочие курсы');

    const finish = await turn('нет');
    const finalState = firstEvent<DialogStateEvent>(finish, 'DIALOG_STATE');
    expect(finalState).toMatchObject({ active: false, step: 'complete', answered: 5 });

    const finalPlan = firstEvent<PlanEvent>(finish, 'PLAN_DRAFT_UPDATE')?.plan;
    expect(finalPlan?.mainGoal).toBe('Вырасти до Senior Frontend Developer');
    expect(finalPlan?.directions).toHaveLength(1);
    expect(finalPlan?.directions[0]?.tasks).toHaveLength(2);

    const state = await app.inject({ method: 'GET', url: '/mock/state', headers });
    expect(state.json<{ stage: string }>().stage).toBe('STAGE_4_REFINEMENT');
    expect(state.json<{ plan: IdpPlan }>().plan.directions).toHaveLength(1);
  });

  it('добавляет второе направление по ответу «да»', async () => {
    const reset = await app.inject({ method: 'POST', url: '/mock/reset', headers });
    expect(reset.statusCode).toBe(200);

    await turn();
    await turn('Стать тимлидом');
    await turn('качество кода');
    await turn('ревью и тесты');
    await turn('внедрить линтер');
    const more = await turn('да');
    expect(firstEvent<DialogStateEvent>(more, 'DIALOG_STATE')).toMatchObject({ step: 'direction' });

    await turn('изучение инструментария');
    await turn('освоить новый стек');
    await turn('сделать пет-проект');
    const done = await turn('нет');

    const plan = firstEvent<PlanEvent>(done, 'PLAN_DRAFT_UPDATE')?.plan;
    expect(plan?.directions).toHaveLength(2);
  });

  it('не принимает сообщение без запущенного диалога', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/chat/dialog',
      headers,
      payload: { message: 'привет' },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json<{ error: string }>().error).toBe('dialog_inactive');
  });

  it('отдаёт CORS-заголовок в SSE-ответе (reply.hijack обходит @fastify/cors)', async () => {
    await app.inject({ method: 'POST', url: '/mock/reset', headers });
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/chat/dialog',
      headers: { ...headers, origin: 'http://localhost:4200' },
      payload: {},
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:4200');
  });
});
