import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import { formatIssues, scenarioSchema } from '../domain/schemas.js';
import type { SessionStore } from '../domain/store.js';
import { requirePrincipal } from '../keycloak/guard.js';
import { buildSkillCatalog } from '../domain/seed.js';

interface MockControlContext {
  store: SessionStore;
  guard: preHandlerHookHandler;
}

/**
 * Dev-ручки мока: посмотреть состояние, сбросить всё, переключить сценарий.
 * Не входят в боевой контракт — фронтенд использует их только в dev-панели.
 */
export function registerMockControlRoutes(app: FastifyInstance, ctx: MockControlContext): void {
  const { store, guard } = ctx;

  app.get('/mock/state', { preHandler: guard }, async (request, reply) => {
    const principal = requirePrincipal(request);
    const session = store.get(principal.sub, principal.name);
    const catalog = buildSkillCatalog(session.context.targetPosition);

    return reply.send({
      subject: { sub: session.subjectId, name: session.subjectName },
      scenario: session.scenario,
      stage: session.stage,
      context: session.context,
      skills: session.skills.length > 0 ? session.skills : catalog.skills,
      plan: session.plan,
      chatMessages: session.chat.length,
      exportedAt: session.exportedAt,
      updatedAt: session.updatedAt,
    });
  });

  app.post('/mock/reset', { preHandler: guard }, async (_request, reply) => {
    store.resetAll();
    return reply.send({ ok: true, message: 'Все сессии мока очищены' });
  });

  app.post('/mock/scenario', { preHandler: guard }, async (request, reply) => {
    const principal = requirePrincipal(request);
    const parsed = scenarioSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(422).send({
        error: 'validation_error',
        message: 'scenario: known_employee | new_employee',
        errors: formatIssues(parsed.error),
      });
    }

    const session = store.setScenario(principal.sub, principal.name, parsed.data.scenario);
    return reply.send({
      scenario: session.scenario,
      stage: session.stage,
      context: session.context,
    });
  });
}
