import {
  DEVELOPMENT_DIRECTIONS,
  DIRECTION,
  TOOL,
} from './dictionaries.js';
import type { DevelopmentDirection, DevelopmentTool } from './dictionaries.js';
import type { DialogState, IdpDirection, IdpPlan, IdpTask } from '../types.js';

/**
 * Симуляция диалога с пользователем, по итогам которого заполняется ИПР.
 *
 * Сценарий: цель → направление → что развить → конкретные действия →
 * «добавить ещё направление?» (до 3 направлений). Ответы пользователя
 * интерпретируются и сразу попадают в план, поэтому черновик наполняется
 * по ходу диалога, а не одним запросом в конце.
 */

export const DIALOG_TOTAL_STEPS = 5;
export const MAX_DIRECTIONS = 3;

export function emptyDialogState(): DialogState {
  return { active: false, step: 'goal', directionIndex: -1, answered: 0, total: DIALOG_TOTAL_STEPS };
}

export interface DialogTurn {
  plan: IdpPlan;
  state: DialogState;
  /** Очередной вопрос ассистента. */
  question: string;
  done: boolean;
}

const GOAL_QUESTION =
  'Здравствуйте! Соберу ИПР в формате короткого диалога — это займёт пару минут.\n\n' +
  'Шаг 1 из 5. Какую ключевую цель вы хотите достичь в этом ИПР? ' +
  'Например: «вырасти до Senior Frontend Developer и закрывать задачи без ревью».';

const DIRECTION_QUESTION =
  'Шаг 2 из 5. Какое направление развития будем прорабатывать? ' +
  'Можно своими словами — я подберу подходящее из справочника. ' +
  'Например: «управленческие компетенции» или «качество кода».';

const ACTIONS_QUESTION =
  'Шаг 4 из 5. Перечислите конкретные действия через запятую — каждое станет задачей плана. ' +
  'Например: «пройти курс по TypeScript, взять ревью у тимлида, выступить с докладом».';

const MORE_QUESTION = 'Шаг 5 из 5. Добавим ещё одно направление? Напишите «да» или «нет».';

function focusQuestion(plan: IdpPlan, state: DialogState): string {
  const goal = plan.directions[state.directionIndex]?.goal ?? 'выбранное направление';
  return `Шаг 3 из 5. Направление «${goal}». Что именно важно развить внутри него? Опишите в свободной форме.`;
}

/** Вопрос для текущего шага — используется при повторном входе в диалог. */
export function questionForState(plan: IdpPlan, state: DialogState): string {  switch (state.step) {
    case 'goal':
      return GOAL_QUESTION;
    case 'direction':
      return state.directionIndex < 0
        ? DIRECTION_QUESTION
        : 'Хорошо, добавляем ещё одно направление. Какое?';
    case 'focus':
      return focusQuestion(plan, state);
    case 'actions':
      return ACTIONS_QUESTION;
    case 'more':
      return MORE_QUESTION;
    default:
      return 'Диалог завершён. План можно править в черновике.';
  }
}

/** Повторная выдача вопроса без ответа пользователя (перезагрузка страницы). */
export function resumeDialog(plan: IdpPlan, state: DialogState): DialogTurn {
  return {
    plan,
    state,
    question: questionForState(plan, state),
    done: !state.active,
  };
}

// ---------------------------------------------------------------------------
// Старт диалога
// ---------------------------------------------------------------------------

export function startDialog(plan: IdpPlan): DialogTurn {
  const state: DialogState = {
    active: true,
    step: 'goal',
    directionIndex: -1,
    answered: 0,
    total: DIALOG_TOTAL_STEPS,
  };
  return { plan, state, question: GOAL_QUESTION, done: false };
}

// ---------------------------------------------------------------------------
// Обработка ответа
// ---------------------------------------------------------------------------

export function advanceDialog(
  plan: IdpPlan,
  state: DialogState,
  message: string,
  now: Date,
): DialogTurn {
  const text = message.trim();
  const next: IdpPlan = structuredClone(plan);

  switch (state.step) {
    case 'goal': {
      next.mainGoal = text || next.mainGoal;
      return {
        plan: next,
        state: { ...state, step: 'direction', answered: 1 },
        question: DIRECTION_QUESTION,
        done: false,
      };
    }

    case 'direction': {
      const goal = matchDirection(text);
      next.directions.push({
        rank: Math.min(next.directions.length, 2) as IdpDirection['rank'],
        goal,
        description: '',
        tasks: [],
      });
      const index = next.directions.length - 1;
      const nextState: DialogState = { ...state, step: 'focus', directionIndex: index, answered: 2 };
      return {
        plan: next,
        state: nextState,
        question: focusQuestion(next, nextState),
        done: false,
      };
    }

    case 'focus': {
      const direction = next.directions[state.directionIndex];
      if (direction) direction.description = text;
      return {
        plan: next,
        state: { ...state, step: 'actions', answered: 3 },
        question: ACTIONS_QUESTION,
        done: false,
      };
    }

    case 'actions': {
      const direction = next.directions[state.directionIndex];
      if (direction) direction.tasks = parseActions(text, now);
      return {
        plan: next,
        state: { ...state, step: 'more', answered: 4 },
        question: MORE_QUESTION,
        done: false,
      };
    }

    case 'more': {
      if (isYes(text) && next.directions.length < MAX_DIRECTIONS) {
        return {
          plan: next,
          state: { ...state, step: 'direction', answered: 2 },
          question: 'Хорошо, добавляем ещё одно направление. Какое?',
          done: false,
        };
      }
      return finish(next, state);
    }

    default:
      return finish(next, state);
  }
}

// ---------------------------------------------------------------------------
// Завершение и нормализация плана
// ---------------------------------------------------------------------------

function finish(plan: IdpPlan, state: DialogState): DialogTurn {
  const normalized = normalizePlan(plan);
  const tasks = normalized.directions.reduce((sum, d) => sum + d.tasks.length, 0);
  return {
    plan: normalized,
    state: {
      ...state,
      active: false,
      step: 'complete',
      directionIndex: -1,
      answered: DIALOG_TOTAL_STEPS,
    },
    question:
      `Готово: цель «${normalized.mainGoal}», направлений — ${normalized.directions.length}, ` +
      `действий — ${tasks}. План открыт в черновике — можно править вручную или продолжить диалог.`,
    done: true,
  };
}

function normalizePlan(plan: IdpPlan): IdpPlan {
  const mainGoal = plan.mainGoal.trim() || 'Повышение эффективности в текущей роли';

  const directions: IdpDirection[] = plan.directions.map((direction, index) => {
    const goal = ensureDirection(direction.goal);
    const description =
      direction.description.trim() ||
      `Развитие в рамках направления «${goal}» для достижения цели «${mainGoal}».`;
    const tasks =
      direction.tasks.length > 0
        ? direction.tasks
        : [
            {
              developmentTool: TOOL.workplace,
              comment: '',
              deadLine: defaultDeadline(new Date()),
              description: `Составить и выполнить план развития по направлению «${goal}»`,
              commentAuthor: '',
              commentCreatedAt: '',
            },
          ];

    return {
      rank: Math.min(index, 2) as IdpDirection['rank'],
      goal,
      description,
      tasks,
    };
  });

  if (directions.length === 0) {
    directions.push({
      rank: 0,
      goal: DIRECTION.personal,
      description: `Развитие компетенций для достижения цели «${mainGoal}».`,
      tasks: [
        {
          developmentTool: TOOL.workplace,
          comment: '',
          deadLine: defaultDeadline(new Date()),
          description: 'Определить первые шаги по цели и согласовать их с руководителем',
          commentAuthor: '',
          commentCreatedAt: '',
        },
      ],
    });
  }

  return { mainGoal, directions };
}

function defaultDeadline(from: Date): string {
  const date = new Date(from.getTime());
  date.setUTCDate(date.getUTCDate() + 90);
  return date.toISOString();
}

// ---------------------------------------------------------------------------
// Разбор свободного текста
// ---------------------------------------------------------------------------

const DIRECTION_RULES: Array<[RegExp, DevelopmentDirection]> = [
  [/управлен|команд|лидер|руковод|делег/i, DIRECTION.management],
  [/качеств|ошибк|баг|надёжн|ревью/i, DIRECTION.quality],
  [/скорост|быстр|производительн/i, DIRECTION.speed],
  [/технолог|инструмент|стек|typescript|angular|react|frontend|backend/i, DIRECTION.tooling],
  [/продукт|домен|бизнес|предметн/i, DIRECTION.products],
  [/личн|коммуник|soft|эмоцион|стресс/i, DIRECTION.personal],
  [/резерв|повышени|карьер|рост в должност/i, DIRECTION.reserve],
  [/процесс|регламент/i, DEVELOPMENT_DIRECTIONS[8]],
  [/адаптац|нович|онбординг/i, DIRECTION.adaptation],
];

export function matchDirection(text: string): DevelopmentDirection {
  const normalized = text.toLowerCase();
  if (!normalized) return DIRECTION.personal;

  // Точное/частичное совпадение со справочником важнее эвристик.
  const direct = DEVELOPMENT_DIRECTIONS.find((goal) => {
    const candidate = goal.toLowerCase();
    return candidate === normalized || candidate.includes(normalized) || normalized.includes(candidate);
  });
  if (direct) return direct;

  for (const [pattern, goal] of DIRECTION_RULES) {
    if (pattern.test(normalized)) return goal;
  }
  return DIRECTION.personal;
}

export function matchTool(text: string): DevelopmentTool {
  const normalized = text.toLowerCase();
  if (/курс|обучен|вебинар|тренинг|лекц/i.test(normalized)) return TOOL.courses;
  if (/наставник|ментор|коллег|ревью|обратн|доклад|сообществ/i.test(normalized)) return TOOL.others;
  return TOOL.workplace;
}

export function parseActions(text: string, now: Date): IdpTask[] {
  const raw = text
    .split(/[;,\n]+/)
    .map((item) => item.replace(/^[\s\-–—•*\d.)]+/, '').trim())
    .filter((item) => item.length > 2);

  const items = raw.length > 0 ? raw : [text.trim()].filter((item) => item.length > 0);
  const horizonDays = parseHorizonDays(text);

  return items.slice(0, 5).map((description) => {
    const deadLine = new Date(now.getTime());
    deadLine.setUTCDate(deadLine.getUTCDate() + horizonDays);
    return {
      developmentTool: matchTool(description),
      comment: '',
      deadLine: deadLine.toISOString(),
      description: capitalize(description),
      commentAuthor: '',
      commentCreatedAt: '',
    };
  });
}

function parseHorizonDays(text: string): number {
  const months = text.match(/(\d+)\s*мес/i);
  if (months) return Math.max(1, Number(months[1])) * 30;
  const weeks = text.match(/(\d+)\s*недел/i);
  if (weeks) return Math.max(1, Number(weeks[1])) * 7;
  return 90;
}

// ---------------------------------------------------------------------------
// Подсказки для чата (если пользователь не знает, что ответить)
// ---------------------------------------------------------------------------

const SUGGESTIONS: Record<DialogState['step'], string[]> = {
  goal: ['Вырасти до Senior', 'Научиться делегировать', 'Повысить качество кода'],
  direction: ['Управленческие компетенции', 'Качество кода', 'Изучение инструментов'],
  focus: ['Делегирование', 'Обратная связь', 'Планирование'],
  actions: ['Пройти курс', 'Взять наставника', 'Выступить с докладом'],
  more: ['Да', 'Нет'],
  complete: [],
};

export function suggestionsForState(state: DialogState): string[] {
  return SUGGESTIONS[state.step] ?? [];
}

function isYes(text: string): boolean {
  // \b в JS не работает для кириллицы (ASCII word chars), поэтому проверяем
  // конец строки/пробел явно.
  return /^(да|ага|конечно|давай|yes|ok|ок)(\s|$)/iu.test(text.trim());
}

function capitalize(value: string): string {
  return value.length > 0 ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

function ensureDirection(goal: string): DevelopmentDirection {
  const match = DEVELOPMENT_DIRECTIONS.find((direction) => direction === goal);
  return match ?? DIRECTION.personal;
}
