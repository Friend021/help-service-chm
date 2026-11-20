import { describe, expect, it } from 'vitest';
import { DIRECTION, TOOL } from './dictionaries.js';
import { refinePlan } from './plan-refiner.js';
import type { IdpPlan } from '../types.js';

const NOW = new Date('2026-10-23T08:00:00.000Z');

function samplePlan(): IdpPlan {
  return {
    mainGoal: 'Перейти на Senior Frontend Developer',
    directions: [
      {
        rank: 0,
        goal: DIRECTION.tooling,
        description: 'Развить инструментарий',
        tasks: [
          {
            developmentTool: TOOL.courses,
            comment: '',
            deadLine: '2027-01-15T12:00:00.000Z',
            description: 'Пройти курс по архитектуре',
          },
        ],
      },
      {
        rank: 1,
        goal: DIRECTION.management,
        description: 'Развить менторство',
        tasks: [
          {
            developmentTool: TOOL.others,
            comment: '',
            deadLine: '2027-02-15T12:00:00.000Z',
            description: 'Менторить джуна',
          },
        ],
      },
    ],
  };
}

describe('refinePlan', () => {
  it('меняет приоритет указанного направления', () => {
    const result = refinePlan(samplePlan(), 'Поставь низкий приоритет направлению 2', NOW);
    expect(result.plan.directions[1]?.rank).toBe(2);
    expect(result.changes.some((change) => change.includes('приоритет'))).toBe(true);
    expect(result.reply).toContain('Готово');
  });

  it('добавляет направление с распознанной целью', () => {
    const result = refinePlan(samplePlan(), 'Добавь направление по управленческим компетенциям', NOW);
    expect(result.plan.directions).toHaveLength(3);
    expect(result.plan.directions[2]?.goal).toBe(DIRECTION.management);
    expect(result.plan.directions[2]?.tasks).toHaveLength(1);
  });

  it('добавляет действие в первое направление', () => {
    const result = refinePlan(samplePlan(), 'Добавь задачу по микрофронтендам', NOW);
    expect(result.plan.directions[0]?.tasks).toHaveLength(2);
    expect(result.plan.directions[0]?.tasks[1]?.description).toContain('микрофронтенд');
  });

  it('сдвигает срок на указанный месяц и год', () => {
    const result = refinePlan(samplePlan(), 'Перенеси дедлайн на декабрь 2026', NOW);
    for (const direction of result.plan.directions) {
      expect(direction.tasks.every((task) => task.deadLine.startsWith('2026-12'))).toBe(true);
    }
  });

  it('выбирает следующий год, если месяц уже прошёл', () => {
    const result = refinePlan(samplePlan(), 'Сдвинь срок на март', NOW);
    expect(result.plan.directions[0]?.tasks[0]?.deadLine.startsWith('2027-03')).toBe(true);
  });

  it('меняет инструмент развития на практику', () => {
    const result = refinePlan(samplePlan(), 'Сделай упор на практику в проекте', NOW);
    expect(result.plan.directions[0]?.tasks[0]?.developmentTool).toBe(TOOL.workplace);
  });

  it('заменяет инструмент на рабочие курсы', () => {
    const result = refinePlan(samplePlan(), 'Замени инструмент на рабочие курсы', NOW);
    expect(result.plan.directions[0]?.tasks[0]?.developmentTool).toBe(TOOL.courses);
  });

  it('не удаляет последнее направление', () => {
    const plan: IdpPlan = {
      mainGoal: 'Цель',
      directions: [samplePlan().directions[0]!],
    };
    const result = refinePlan(plan, 'Удали направление 1', NOW);
    expect(result.plan.directions).toHaveLength(1);
  });

  it('уточняет описание, если правило не распознано', () => {
    const result = refinePlan(samplePlan(), 'Хочу больше конкретики по срокам и результатам', NOW);
    expect(result.plan.directions[0]?.description).toContain('Уточнение');
    expect(result.plan.directions[0]?.tasks[0]?.comment).toContain('конкретики');
    expect(result.changes).toHaveLength(1);
  });
});
