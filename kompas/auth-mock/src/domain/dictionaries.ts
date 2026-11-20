/**
 * Строгие справочники ИПР. Источник — согласованные значения из ТЗ.
 * Мок отдаёт их через GET /api/v1/idp/dictionaries и валидирует
 * значения при экспорте.
 */

export const DEVELOPMENT_DIRECTIONS = [
  'Цели развития не определены/Развитие не требуется',
  'Адаптация к должности',
  'Повышение объемов производства',
  'Увеличение скорости выполнения задач',
  'Увеличение качества выполняемых задач',
  'Развитие личностных компетенций',
  'Развитие управленческих компетенций',
  'Кадровый резерв на должность/роль',
  'Адаптация к процессам',
  'Изучение продуктов',
  'Изучение инструментария и технологий',
] as const;

export type DevelopmentDirection = (typeof DEVELOPMENT_DIRECTIONS)[number];

export interface PriorityOption {
  rank: number;
  label: 'Высокий' | 'Средний' | 'Низкий';
}

export const PRIORITY_OPTIONS: readonly PriorityOption[] = [
  { rank: 0, label: 'Высокий' },
  { rank: 1, label: 'Средний' },
  { rank: 2, label: 'Низкий' },
] as const;

export const DEVELOPMENT_TOOLS = [
  'Развитие на рабочем месте',
  'Развитие через других',
  'Развитие через рабочие курсы',
] as const;

export type DevelopmentTool = (typeof DEVELOPMENT_TOOLS)[number];

export const DIRECTION = {
  none: DEVELOPMENT_DIRECTIONS[0],
  adaptation: DEVELOPMENT_DIRECTIONS[1],
  speed: DEVELOPMENT_DIRECTIONS[3],
  quality: DEVELOPMENT_DIRECTIONS[4],
  personal: DEVELOPMENT_DIRECTIONS[5],
  management: DEVELOPMENT_DIRECTIONS[6],
  reserve: DEVELOPMENT_DIRECTIONS[7],
  products: DEVELOPMENT_DIRECTIONS[9],
  tooling: DEVELOPMENT_DIRECTIONS[10],
} as const satisfies Record<string, DevelopmentDirection>;

export const TOOL = {
  workplace: DEVELOPMENT_TOOLS[0],
  others: DEVELOPMENT_TOOLS[1],
  courses: DEVELOPMENT_TOOLS[2],
} as const satisfies Record<string, DevelopmentTool>;

export const DIRECTION_OPTIONS = DEVELOPMENT_DIRECTIONS.map((goal) => ({ goal }));
export const TOOL_OPTIONS = DEVELOPMENT_TOOLS.map((developmentTool) => ({ developmentTool }));
