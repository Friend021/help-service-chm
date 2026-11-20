import type { IdpDirection, IdpPlan, IdpTask } from '../types.js';
import { DEVELOPMENT_DIRECTIONS, DIRECTION, TOOL } from './dictionaries.js';

export interface RefineResult {
  plan: IdpPlan;
  changes: string[];
  reply: string;
}

const MONTHS: ReadonlyArray<{ pattern: RegExp; month: number; label: string }> = [
  { pattern: /январ/i, month: 0, label: 'январь' },
  { pattern: /феврал/i, month: 1, label: 'февраль' },
  { pattern: /март/i, month: 2, label: 'март' },
  { pattern: /апрел/i, month: 3, label: 'апрель' },
  { pattern: /ма[йя]/i, month: 4, label: 'май' },
  { pattern: /июн/i, month: 5, label: 'июнь' },
  { pattern: /июл/i, month: 6, label: 'июль' },
  { pattern: /август/i, month: 7, label: 'август' },
  { pattern: /сентябр/i, month: 8, label: 'сентябрь' },
  { pattern: /октябр/i, month: 9, label: 'октябрь' },
  { pattern: /ноябр/i, month: 10, label: 'ноябрь' },
  { pattern: /декабр/i, month: 11, label: 'декабрь' },
];

const TOOL_PATTERNS: ReadonlyArray<{ pattern: RegExp; tool: string }> = [
  { pattern: /курс/i, tool: TOOL.courses },
  { pattern: /практик|рабоч[а-яё]+ месте|на работе|проект(е|ом)?\b/i, tool: TOOL.workplace },
  { pattern: /ментор|наставник|через других|коллег|команд/i, tool: TOOL.others },
];

const GOAL_PATTERNS: ReadonlyArray<{ pattern: RegExp; goal: string }> = [
  { pattern: /микрофронтенд|архитектур|технолог|инструмент|frontend|фронт/i, goal: DIRECTION.tooling },
  { pattern: /управлен|лидер|менедж|руковод/i, goal: DIRECTION.management },
  { pattern: /продукт/i, goal: DIRECTION.products },
  { pattern: /коммуникац|личност|софт.?скилл|soft/i, goal: DIRECTION.personal },
  { pattern: /качеств/i, goal: DIRECTION.quality },
  { pattern: /скорост|быстрее/i, goal: DIRECTION.speed },
  { pattern: /резерв/i, goal: DIRECTION.reserve },
  { pattern: /адаптац/i, goal: DIRECTION.adaptation },
];

function clonePlan(plan: IdpPlan): IdpPlan {
  return structuredClone(plan);
}

function detectDirectionIndex(message: string): number | null {
  const match = /направлени[а-яё]*\s*(?:№\s*)?(\d+)/i.exec(message);
  if (!match) return null;
  const index = Number.parseInt(match[1] ?? '', 10) - 1;
  return Number.isFinite(index) && index >= 0 ? index : null;
}

function pickDirection(plan: IdpPlan, message: string): IdpDirection {
  const index = detectDirectionIndex(message) ?? 0;
  return plan.directions[Math.min(index, plan.directions.length - 1)] as IdpDirection;
}

function detectTool(message: string): string | null {
  const byGeneral = /замен|смен|измени|переключ|сделай|переведи|упор/i.test(message);
  for (const { pattern, tool } of TOOL_PATTERNS) {
    if (pattern.test(message) && (byGeneral || /курс|практик|ментор|наставник/i.test(message))) {
      return tool;
    }
  }
  return null;
}

function detectRank(message: string): number | null {
  if (!/приоритет|ранг|важност/i.test(message)) return null;
  if (/высок/i.test(message)) return 0;
  if (/средн/i.test(message)) return 1;
  if (/низк/i.test(message)) return 2;
  return null;
}

function detectGoal(message: string): string | null {
  const explicit = DEVELOPMENT_DIRECTIONS.find((goal) => message.toLowerCase().includes(goal.toLowerCase()));
  if (explicit) return explicit;
  for (const { pattern, goal } of GOAL_PATTERNS) {
    if (pattern.test(message)) return goal;
  }
  return null;
}

function detectDate(message: string, now: Date): Date | null {
  const iso = /\b(20\d{2})-(\d{2})-(\d{2})\b/.exec(message);
  if (iso) {
    const date = new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]), 12, 0, 0, 0));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const monthEntry = MONTHS.find(({ pattern }) => pattern.test(message));
  if (!monthEntry) return null;

  const yearMatch = /\b(20\d{2})\b/.exec(message);
  let year = yearMatch ? Number(yearMatch[1]) : now.getUTCFullYear();
  if (!yearMatch && monthEntry.month < now.getUTCMonth()) year += 1;
  return new Date(Date.UTC(year, monthEntry.month, 15, 12, 0, 0, 0));
}

function buildTask(message: string, now: Date): IdpTask {
  const deadline = detectDate(message, now) ?? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 3, 15, 12, 0, 0, 0));
  const cleaned = message
    .replace(/^(пожалуйста[,\s]*)?(добавь|добавить|включи|создай)\s*/i, '')
    .replace(/^(новое\s+)?(направление|действие|задачу)\s*/i, '')
    .trim();
  return {
    developmentTool: detectTool(message) ?? TOOL.workplace,
    comment: '',
    deadLine: deadline.toISOString(),
    description: cleaned.length > 0 ? `Проработать: ${cleaned}` : 'Проработать задачу из диалога с ассистентом.',
    commentAuthor: '',
    commentCreatedAt: '',
  };
}

function ensureStructure(plan: IdpPlan, now: Date): void {
  if (plan.directions.length === 0) {
    plan.directions.push({
      rank: 0,
      goal: DIRECTION.tooling,
      description: 'Направление добавлено по итогам диалога.',
      tasks: [],
    });
  }
  const fallbackDeadline = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 3, 15, 12, 0, 0, 0));
  for (const direction of plan.directions) {
    if (direction.tasks.length === 0) {
      direction.tasks.push({
        developmentTool: TOOL.workplace,
        comment: '',
        deadLine: fallbackDeadline.toISOString(),
        description: 'Проработать действия по направлению с руководителем.',
        commentAuthor: '',
        commentCreatedAt: '',
      });
    }
  }
}

/**
 * Разбор сообщения пользователя на Этапе 4 (цикл корректировки).
 * Правила детерминированные: приоритет, срок, инструмент, добавление/удаление
 * направлений и действий, смена направления. Всё остальное — уточнение описания.
 */
export function refinePlan(plan: IdpPlan, message: string, now: Date): RefineResult {
  const result = clonePlan(plan);
  ensureStructure(result, now);
  const changes: string[] = [];

  const wantsAdd = /добав|включи|создай/i.test(message);
  const wantsRemove = /удали|убери|удалить/i.test(message);
  const addingDirection = wantsAdd && /направлен/i.test(message);
  const rank = detectRank(message);
  const tool = detectTool(message);
  const date = detectDate(message, now);
  const goal = detectGoal(message);

  if (wantsAdd && /направлен/i.test(message)) {
    const newGoal = goal ?? DIRECTION.tooling;
    result.directions.push({
      rank: rank ?? 1,
      goal: newGoal,
      description: `Направление добавлено по запросу: «${message}».`,
      tasks: [buildTask(message, now)],
    });
    changes.push(`добавлено направление «${newGoal}»`);
  } else if (wantsAdd) {
    const direction = pickDirection(result, message);
    direction.tasks.push(buildTask(message, now));
    changes.push(`добавлено действие в направление «${direction.goal}»`);
  }

  if (wantsRemove) {
    if (/направлен/i.test(message)) {
      const index = Math.min(detectDirectionIndex(message) ?? result.directions.length - 1, result.directions.length - 1);
      if (result.directions.length > 1 && index >= 0) {
        const [removed] = result.directions.splice(index, 1);
        changes.push(`удалено направление «${removed?.goal ?? index + 1}»`);
      }
    } else {
      const direction = pickDirection(result, message);
      if (direction.tasks.length > 1) {
        const taskIndex = Math.max(0, direction.tasks.length - 1);
        direction.tasks.splice(taskIndex, 1);
        changes.push(`удалено действие из направления «${direction.goal}»`);
      }
    }
  }

  if (goal && !wantsAdd) {
    const direction = pickDirection(result, message);
    if (direction.goal !== goal) {
      direction.goal = goal;
      changes.push(`направление изменено на «${goal}»`);
    }
  }

  if (rank !== null && !addingDirection) {
    const direction = pickDirection(result, message);
    direction.rank = rank;
    changes.push(`приоритет направления «${direction.goal}» — ${rank}`);
  }

  if (tool && !wantsAdd) {
    const direction = pickDirection(result, message);
    for (const task of direction.tasks) task.developmentTool = tool;
    changes.push(`инструмент развития в «${direction.goal}» — «${tool}»`);
  }

  if (date) {
    const direction = detectDirectionIndex(message) !== null ? pickDirection(result, message) : null;
    const targets = direction ? [direction] : result.directions;
    for (const item of targets) {
      for (const task of item.tasks) task.deadLine = date.toISOString();
    }
    changes.push(`срок выполнения — ${date.toISOString().slice(0, 10)}`);
  }

  if (changes.length === 0) {
    const direction = pickDirection(result, message);
    const trimmed = message.length > 280 ? `${message.slice(0, 277)}...` : message;
    direction.description = direction.description
      ? `${direction.description} Уточнение: ${trimmed}`
      : `Уточнение из диалога: ${trimmed}`;
    const task = direction.tasks[0];
    if (task) task.comment = trimmed;
    changes.push('пожелание учтено в описании направления и комментарии к действию');
  }

  ensureStructure(result, now);

  const reply =
    `Готово — обновил черновик. ${changes.join('; ')}. ` +
    'Правая панель уже обновлена. Скажите, если нужно поправить ещё что-то, или подтвердите вариант.';

  return { plan: result, changes, reply };
}
