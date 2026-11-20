import { randomUUID } from 'node:crypto';
import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import type { Env } from '../config.js';
import { generateDraft } from '../domain/plan-generator.js';
import { refinePlan } from '../domain/plan-refiner.js';
import { advanceDialog, resumeDialog, startDialog, suggestionsForState } from '../domain/dialog.js';
import type { DialogTurn } from '../domain/dialog.js';
import {
  confirmSchema,
  dialogSchema,
  formatIssues,
  generateDraftSchema,
  idpPlanDraftSchema,
  idpPlanSchema,
  refineDraftSchema,
} from '../domain/schemas.js';
import { buildSkillCatalog } from '../domain/seed.js';
import type { SessionStore } from '../domain/store.js';
import { requirePrincipal } from '../keycloak/guard.js';
import { initialDelay, runSse } from '../sse.js';
import { stageUpdate, type SkillAssessmentItem } from '../types.js';

interface ChatRoutesContext {
  env: Env;
  store: SessionStore;
  guard: preHandlerHookHandler;
  now: () => Date;
}

function priorityLabel(rank: number): string {
  return rank === 0 ? 'высокий' : rank === 1 ? 'средний' : 'низкий';
}

export function registerChatRoutes(app: FastifyInstance, ctx: ChatRoutesContext): void {
  const { env, store, guard, now } = ctx;

  app.get('/api/v1/chat/messages', { preHandler: guard }, async (request, reply) => {
    const principal = requirePrincipal(request);
    const session = store.get(principal.sub, principal.name);
    return reply.send({ stage: session.stage, messages: session.chat, dialog: session.dialog });
  });

  app.post('/api/v1/chat/init-assessment', { preHandler: guard }, async (request, reply) => {
    const principal = requirePrincipal(request);
    const session = store.get(principal.sub, principal.name);

    if (!session.context.targetPosition) {
      return reply.code(409).send({
        error: 'context_incomplete',
        message: 'Целевая должность не определена. Сначала выполните Шаг 1.2 (ручной ввод должностей).',
      });
    }

    const catalog = buildSkillCatalog(session.context.targetPosition);
    store.setSkills(session, catalog.skills);
    store.touch(session, 'STAGE_2_QUESTIONNAIRE');

    const text =
      `Я нашёл должностную инструкцию для перехода на позицию «${session.context.targetPosition}». ` +
      'Чтобы составить персональный план, оцените, пожалуйста, ваш текущий уровень по ключевым компетенциям от 1 до 5.';

    const messageId = randomUUID();
    store.addChatMessage(session, 'assistant', text, messageId);

    await runSse(reply, env, async (writer) => {
      await writer.send(stageUpdate('STAGE_2_QUESTIONNAIRE'));
      await initialDelay(env);
      await writer.streamText(messageId, text);
      await writer.send({ type: 'QUESTIONNAIRE_READY', skills: session.skills });
      await writer.send({ type: 'DONE' });
    });
  });

  app.post('/api/v1/chat/generate-draft', { preHandler: guard }, async (request, reply) => {
    const principal = requirePrincipal(request);
    const parsed = generateDraftSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(422).send({
        error: 'validation_error',
        message: 'Передайте оценки навыков от 1 до 5',
        errors: formatIssues(parsed.error),
      });
    }

    const session = store.get(principal.sub, principal.name);
    if (!session.context.targetPosition) {
      return reply.code(409).send({
        error: 'context_incomplete',
        message: 'Целевая должность не определена. Сначала выполните Шаг 1.2.',
      });
    }

    if (session.skills.length === 0) {
      store.setSkills(session, buildSkillCatalog(session.context.targetPosition).skills);
    }

    const ratings = new Map(parsed.data.ratings.map((item) => [item.skillId, item.rating]));
    const unknown = [...ratings.keys()].filter((skillId) => !session.skills.some((skill) => skill.skillId === skillId));
    if (unknown.length > 0) {
      return reply.code(422).send({
        error: 'validation_error',
        message: 'Оценки содержат навыки, которых нет в текущем опроснике',
        errors: unknown.map((skillId) => ({ path: 'ratings', message: `Неизвестный skillId: ${skillId}` })),
      });
    }

    const missing = session.skills.filter((skill) => !ratings.has(skill.skillId));
    if (missing.length > 0) {
      return reply.code(422).send({
        error: 'validation_error',
        message: 'Оцените все навыки из опросника',
        errors: missing.map((skill) => ({ path: 'ratings', message: `Нет оценки для «${skill.skillName}»` })),
      });
    }

    const rated: SkillAssessmentItem[] = session.skills.map((skill) => ({
      ...skill,
      rating: ratings.get(skill.skillId) ?? null,
    }));
    store.setSkills(session, rated);

    const plan = generateDraft({ context: session.context, skills: rated, now: now() });
    session.plan = plan;
    store.touch(session, 'STAGE_3_DRAFT_GEN');
    const weak = rated.filter((skill) => (skill.rating ?? 5) < 4);
    const intro =
      weak.length > 0
        ? `Спасибо, оценки получены. Точки роста: ${weak.map((skill) => `«${skill.skillName}» (${skill.rating}/5)`).join(', ')}. ` +
          `Сформировал черновик ИПР: ${plan.directions.length} направл. и ${plan.directions.reduce((sum, d) => sum + d.tasks.length, 0)} конкретных действий.`
        : 'Спасибо, оценки получены. Все ключевые компетенции на высоком уровне — сформировал план на поддержание и передачу опыта.';
    const question =
      'Черновик ИПР сформирован в правой панели. Хотите что-то скорректировать через диалог или мы готовы перенести план?';

    const introId = randomUUID();
    const questionId = randomUUID();
    store.addChatMessage(session, 'assistant', intro, introId);
    store.addChatMessage(session, 'assistant', question, questionId);
    store.touch(session, 'STAGE_4_REFINEMENT');

    await runSse(reply, env, async (writer) => {
      await writer.send(stageUpdate('STAGE_3_DRAFT_GEN'));
      await initialDelay(env);
      await writer.streamText(introId, intro);
      await writer.send({ type: 'PLAN_DRAFT_UPDATE', plan });
      await writer.send(stageUpdate('STAGE_4_REFINEMENT'));
      await writer.streamText(questionId, question);
      await writer.send({ type: 'DONE' });
    });
  });

  app.post('/api/v1/chat/dialog', { preHandler: guard }, async (request, reply) => {
    const principal = requirePrincipal(request);
    const parsed = dialogSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(422).send({
        error: 'validation_error',
        message: 'Некорректное сообщение диалога',
        errors: formatIssues(parsed.error),
      });
    }

    const session = store.get(principal.sub, principal.name);
    const message = parsed.data.message?.trim();

    let turn: DialogTurn;
    if (!message) {
      // Без сообщения: старт нового диалога либо повтор текущего вопроса
      // (перезагрузка страницы/повторный вход в черновик).
      turn = session.dialog.active
        ? resumeDialog(session.plan, session.dialog)
        : startDialog(session.plan);
    } else {
      if (!session.dialog.active) {
        return reply.code(409).send({
          error: 'dialog_inactive',
          message: 'Диалог заполнения не запущен. Начните диалог без сообщения.',
        });
      }
      store.addChatMessage(session, 'user', message);
      turn = advanceDialog(session.plan, session.dialog, message, now());
    }

    session.plan = turn.plan;
    session.dialog = turn.state;
    store.touch(session, turn.done ? 'STAGE_4_REFINEMENT' : 'STAGE_3_DRAFT_GEN');

    const questionId = randomUUID();
    store.addChatMessage(session, 'assistant', turn.question, questionId);

    await runSse(reply, env, async (writer) => {
      await writer.send(stageUpdate(session.stage));
      await initialDelay(env);
      await writer.streamText(questionId, turn.question);
      await writer.send({ type: 'PLAN_DRAFT_UPDATE', plan: session.plan });
      await writer.send({
        type: 'DIALOG_STATE',
        active: turn.state.active,
        step: turn.state.step,
        answered: turn.state.answered,
        total: turn.state.total,
        suggestions: suggestionsForState(turn.state),
      });
      await writer.send({ type: 'DONE' });
    });
  });

  app.post('/api/v1/chat/refine-draft', { preHandler: guard }, async (request, reply) => {
    const principal = requirePrincipal(request);
    const parsed = refineDraftSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(422).send({
        error: 'validation_error',
        message: 'Сообщение не может быть пустым',
        errors: formatIssues(parsed.error),
      });
    }

    const session = store.get(principal.sub, principal.name);
    if (session.plan.directions.length === 0) {
      return reply.code(409).send({
        error: 'draft_missing',
        message: 'Черновик ещё не сформирован. Сначала завершите оценку навыков.',
      });
    }

    store.addChatMessage(session, 'user', parsed.data.message);
    const result = refinePlan(session.plan, parsed.data.message, now());
    session.plan = result.plan;
    store.touch(session, 'STAGE_4_REFINEMENT');

    const replyId = randomUUID();
    store.addChatMessage(session, 'assistant', result.reply, replyId);

    await runSse(reply, env, async (writer) => {
      await writer.send(stageUpdate('STAGE_4_REFINEMENT'));
      await initialDelay(env);
      await writer.send({ type: 'PLAN_DRAFT_UPDATE', plan: result.plan });
      await writer.streamText(replyId, result.reply);
      await writer.send({ type: 'DONE' });
    });
  });

  app.post('/api/v1/chat/confirm', { preHandler: guard }, async (request, reply) => {
    const principal = requirePrincipal(request);
    const parsed = confirmSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(422).send({
        error: 'validation_error',
        message: 'Некорректное тело запроса',
        errors: formatIssues(parsed.error),
      });
    }

    const session = store.get(principal.sub, principal.name);
    if (parsed.data.plan) {
      session.plan = idpPlanDraftSchema.parse(parsed.data.plan);
    }
    if (session.plan.directions.length === 0) {
      return reply.code(409).send({ error: 'draft_missing', message: 'Черновик ещё не сформирован' });
    }

    store.touch(session, 'STAGE_5_COMPLETED');
    const validation = idpPlanSchema.safeParse(session.plan);

    return reply.send({
      stage: session.stage,
      plan: store.planSnapshot(session),
      isValid: validation.success,
      validationErrors: validation.success ? [] : validation.error.issues.map((issue) => issue.message),
      priorities: session.plan.directions.map((direction) => ({
        goal: direction.goal,
        rank: direction.rank,
        label: priorityLabel(direction.rank),
      })),
    });
  });
}
