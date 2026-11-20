import { z } from 'zod';
import { DEVELOPMENT_DIRECTIONS, DEVELOPMENT_TOOLS } from './dictionaries.js';

const isoDateTime = z
  .string()
  .min(1, 'Дата обязательна')
  .refine((value) => !Number.isNaN(Date.parse(value)), 'Ожидается ISO 8601, например 2026-10-16T07:32:12.162Z')
  .refine((value) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(value), 'Дата должна быть в UTC (суффикс Z)');

const directionEnum = z.enum(DEVELOPMENT_DIRECTIONS);
const toolEnum = z.enum(DEVELOPMENT_TOOLS);

/** Строгая схема задачи. Используется при экспорте в «План развития». */
export const idpTaskSchema = z.object({
  developmentTool: toolEnum,
  comment: z.string(),
  deadLine: isoDateTime,
  description: z.string().min(1, 'Опишите, что именно предстоит делать'),
  commentAuthor: z.string().optional().default(''),
  commentCreatedAt: z.string().optional().default(''),
});

/** Строгая схема направления. */
export const idpDirectionSchema = z.object({
  rank: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  goal: directionEnum,
  description: z.string().min(1, 'Опишите, что важно развить внутри направления'),
  tasks: z.array(idpTaskSchema).min(1, 'Нужно хотя бы одно конкретное действие'),
});

/** Строгая схема плана: именно её проверяет POST /idp/export. */
export const idpPlanSchema = z.object({
  mainGoal: z.string().trim().min(1, 'Ключевая цель обязательна'),
  directions: z.array(idpDirectionSchema).min(1, 'Нужно хотя бы одно направление развития'),
});

export const idpExportRequestSchema = z.object({
  plan: idpPlanSchema,
});

/**
 * Черновик: те же поля, но без требования заполненности.
 * Нужен для PUT /idp/draft (ручные правки в панели) и для тела export
 * с понятными ошибками по путям.
 */
export const idpTaskDraftSchema = z.object({
  developmentTool: z.string().default(''),
  comment: z.string().default(''),
  deadLine: z.string().default(''),
  description: z.string().default(''),
  commentAuthor: z.string().optional().default(''),
  commentCreatedAt: z.string().optional().default(''),
});

export const idpDirectionDraftSchema = z.object({
  rank: z.number().int().min(0).max(2),
  goal: z.string().default(''),
  description: z.string().default(''),
  tasks: z.array(idpTaskDraftSchema).default([]),
});

export const idpPlanDraftSchema = z.object({
  mainGoal: z.string().default(''),
  directions: z.array(idpDirectionDraftSchema).default([]),
});

export const manualContextSchema = z.object({
  currentPosition: z.string().trim().min(1, 'Укажите текущую должность').max(200),
  targetPosition: z.string().trim().min(1, 'Укажите целевую должность').max(200),
});

export const ratingSchema = z.object({
  skillId: z.string().min(1),
  rating: z.number().int().min(1, 'Оценка от 1 до 5').max(5, 'Оценка от 1 до 5'),
});

export const generateDraftSchema = z.object({
  ratings: z.array(ratingSchema).min(1, 'Передайте оценки хотя бы одного навыка'),
});

export const refineDraftSchema = z.object({
  message: z.string().trim().min(1, 'Сообщение не может быть пустым').max(2000),
});

/** POST /api/v1/chat/dialog: без message — старт диалога, с message — ответ пользователя. */
export const dialogSchema = z.object({
  message: z.string().trim().min(1, 'Сообщение не может быть пустым').max(2000).optional(),
});

export const confirmSchema = z.object({
  plan: idpPlanDraftSchema.optional(),
});

export const scenarioSchema = z.object({
  scenario: z.enum(['known_employee', 'new_employee']),
});

export type ValidationIssue = { path: string; message: string };

export function formatIssues(error: z.ZodError): ValidationIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.length > 0 ? issue.path.join('.') : '(root)',
    message: issue.message,
  }));
}
