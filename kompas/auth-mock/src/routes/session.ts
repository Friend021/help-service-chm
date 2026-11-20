import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import type { Env } from '../config.js';
import { manualContextSchema, formatIssues } from '../domain/schemas.js';
import type { SessionStore } from '../domain/store.js';
import { requirePrincipal } from '../keycloak/guard.js';
import type { Scenario } from '../types.js';

interface SessionRoutesContext {
  env: Env;
  store: SessionStore;
  guard: preHandlerHookHandler;
}

export function registerSessionRoutes(app: FastifyInstance, ctx: SessionRoutesContext): void {
  const { env, store, guard } = ctx;

  app.get('/api/v1/session/context', { preHandler: guard }, async (request, reply) => {
    const principal = requirePrincipal(request);
    const { scenario } = request.query as { scenario?: Scenario };

    const session =
      scenario === 'known_employee' || scenario === 'new_employee'
        ? store.setScenario(principal.sub, principal.name, scenario)
        : store.get(principal.sub, principal.name);

    store.touch(session);
    return reply.send({
      context: session.context,
      scenario: session.scenario,
      stage: session.stage,
      isNewEmployee: session.context.isNewEmployee,
      returnUrl: session.context.returnUrl || env.legacyReturnUrl,
    });
  });

  app.post('/api/v1/session/context/manual', { preHandler: guard }, async (request, reply) => {
    const principal = requirePrincipal(request);
    const parsed = manualContextSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(422).send({
        error: 'validation_error',
        message: 'Проверьте текущую и целевую должность',
        errors: formatIssues(parsed.error),
      });
    }

    const session = store.get(principal.sub, principal.name);
    session.context = {
      ...session.context,
      currentPosition: parsed.data.currentPosition,
      targetPosition: parsed.data.targetPosition,
      isNewEmployee: false,
    };
    session.scenario = 'known_employee';
    session.skills = [];
    session.plan = { mainGoal: '', directions: [] };
    session.exportedAt = null;
    store.touch(session, 'STAGE_2_QUESTIONNAIRE');

    return reply.send({
      context: session.context,
      stage: session.stage,
    });
  });
}
