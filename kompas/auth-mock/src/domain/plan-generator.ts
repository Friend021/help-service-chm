import type { EmployeeContext, IdpDirection, IdpPlan, IdpTask, SkillAssessmentItem } from '../types.js';
import { DIRECTION, TOOL } from './dictionaries.js';
import { buildSkillCatalog } from './seed.js';

const WEAK_RATING_THRESHOLD = 4;

function toIso(date: Date): string {
  return date.toISOString();
}

function addMonths(from: Date, months: number): Date {
  const result = new Date(from.getTime());
  result.setUTCMonth(result.getUTCMonth() + months);
  result.setUTCHours(12, 0, 0, 0);
  return result;
}

function buildTask(skill: SkillAssessmentItem, tool: string, now: Date): IdpTask {
  const months = (skill.rating ?? 3) <= 2 ? 3 : 6;
  return {
    developmentTool: tool,
    comment: '',
    deadLine: toIso(addMonths(now, months)),
    description: `Прокачать навык «${skill.skillName}»: ${skill.description}`,
    commentAuthor: '',
    commentCreatedAt: '',
  };
}

/**
 * Детерминированная «LLM-генерация» черновика ИПР:
 * берём навыки с оценкой ниже 4, группируем по направлениям,
 * приоритет выше у направлений с самыми низкими оценками.
 */
export function generateDraft(input: { context: EmployeeContext; skills: SkillAssessmentItem[]; now: Date }): IdpPlan {
  const { context, skills, now } = input;
  const target = context.targetPosition ?? 'целевую позицию';
  const catalog = buildSkillCatalog(context.targetPosition);
  const meta = catalog.meta;

  const weak = skills
    .filter((skill) => (skill.rating ?? 5) < WEAK_RATING_THRESHOLD)
    .sort((a, b) => (a.rating ?? 5) - (b.rating ?? 5));

  const groups = new Map<string, IdpTask[]>();
  for (const skill of weak) {
    const direction = meta.get(skill.skillId)?.direction ?? DIRECTION.tooling;
    const tool = meta.get(skill.skillId)?.tool ?? TOOL.courses;
    const tasks = groups.get(direction) ?? [];
    tasks.push(buildTask(skill, tool, now));
    groups.set(direction, tasks);
  }

  if (groups.size === 0) {
    const best = [...skills].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))[0];
    const description = best
      ? `Поддерживать и развивать сильную сторону «${best.skillName}», делиться опытом с командой.`
      : 'Поддерживать уровень компетенций и делиться опытом с командой.';
    groups.set(DIRECTION.personal, [
      {
        developmentTool: TOOL.others,
        comment: '',
        deadLine: toIso(addMonths(now, 6)),
        description,
        commentAuthor: '',
        commentCreatedAt: '',
      },
    ]);
  }

  const directions: IdpDirection[] = [...groups.entries()].map(([goal, tasks], index) => ({
    rank: Math.min(index, 2),
    goal,
    description: `Развить компетенции по направлению «${goal}» для перехода на позицию «${target}».`,
    tasks,
  }));

  return {
    mainGoal: `Развитие технических и лидерских компетенций для перехода на позицию «${target}»`,
    directions,
  };
}
