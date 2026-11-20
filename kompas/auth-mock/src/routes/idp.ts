import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import type { Env } from '../config.js';
import {
  DEVELOPMENT_DIRECTIONS,
  DEVELOPMENT_TOOLS,
  PRIORITY_OPTIONS,
} from '../domain/dictionaries.js';
import {
  formatIssues,
  idpExportRequestSchema,
  idpPlanDraftSchema,
  idpPlanSchema,
} from '../domain/schemas.js';
import type { SessionState, SessionStore } from '../domain/store.js';
import { requirePrincipal } from '../keycloak/guard.js';
import { TOTAL_STEPS, type WorkflowStage } from '../types.js';

interface IdpRoutesContext {
  env: Env;
  store: SessionStore;
  guard: preHandlerHookHandler;
  now: () => Date;
}

const STAGE_LABELS: ReadonlyArray<{ stage: WorkflowStage; stepNumber: number; label: string }> = [
  { stage: 'STAGE_1_CONTEXT', stepNumber: 1, label: 'Контекст сотрудника' },
  { stage: 'STAGE_1_2_ONBOARDING', stepNumber: 1, label: 'Ввод текущей и целевой должности' },
  { stage: 'STAGE_2_QUESTIONNAIRE', stepNumber: 2, label: 'Оценка навыков по профилю должности' },
  { stage: 'STAGE_3_DRAFT_GEN', stepNumber: 3, label: 'Формирование черновика ИПР' },
  { stage: 'STAGE_4_REFINEMENT', stepNumber: 4, label: 'Корректировка черновика' },
  { stage: 'STAGE_5_COMPLETED', stepNumber: 5, label: 'Готово к переносу в «План развития»' },
];

export function registerIdpRoutes(app: FastifyInstance, ctx: IdpRoutesContext): void {
  const { env, store, guard, now } = ctx;

  const draftResponse = (session: SessionState) => {
    const validation = idpPlanSchema.safeParse(session.plan);
    return {
      stage: session.stage,
      plan: store.planSnapshot(session),
      isValid: validation.success,
      validationErrors: validation.success ? [] : validation.error.issues.map((issue) => issue.message),
      exportedAt: session.exportedAt ?? null,
    };
  };

  app.get('/api/v1/idp/dictionaries', { preHandler: guard }, async (_request, reply) => {
    return reply.send({
      directions: [...DEVELOPMENT_DIRECTIONS],
      priorities: PRIORITY_OPTIONS,
      developmentTools: [...DEVELOPMENT_TOOLS],
      stages: STAGE_LABELS.map((stage) => ({ ...stage, totalSteps: TOTAL_STEPS })),
    });
  });

  app.get('/api/v1/idp/draft', { preHandler: guard }, async (request, reply) => {
    const principal = requirePrincipal(request);
    const session = store.get(principal.sub, principal.name);
    return reply.send(draftResponse(session));
  });

  app.put('/api/v1/idp/draft', { preHandler: guard }, async (request, reply) => {
    const principal = requirePrincipal(request);
    const body = request.body as { plan?: unknown } | undefined;
    const parsed = idpPlanDraftSchema.safeParse(body?.plan);
    if (!parsed.success) {
      return reply.code(422).send({
        error: 'validation_error',
        message: 'Некорректная структура плана',
        errors: formatIssues(parsed.error),
      });
    }

    const session = store.get(principal.sub, principal.name);
    session.plan = parsed.data;
    session.exportedAt = null;
    store.touch(session);

    return reply.send(draftResponse(session));
  });

  app.post('/api/v1/idp/export', { preHandler: guard }, async (request, reply) => {
    const principal = requirePrincipal(request);
    const parsed = idpExportRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(422).send({
        success: false,
        error: 'validation_error',
        message: 'План не прошёл валидацию контракта «План развития»',
        errors: formatIssues(parsed.error),
      });
    }

    const session = store.get(principal.sub, principal.name);
    session.plan = parsed.data.plan;
    session.exportedAt = now().toISOString();
    store.touch(session, 'STAGE_5_COMPLETED');

    return reply.send({
      success: true,
      returnUrl: env.legacyReturnUrl,
    });
  });
}
