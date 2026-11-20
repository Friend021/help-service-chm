import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import cors from '@fastify/cors';
import formbody from '@fastify/formbody';
import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import { loadEnv, type Env } from './config.js';
import { SessionStore } from './domain/store.js';
import { AuthStore } from './keycloak/auth-store.js';
import { createAuthGuard } from './keycloak/guard.js';
import { createSigningKeys } from './keycloak/keys.js';
import { registerKeycloakRoutes } from './keycloak/routes.js';
import { registerChatRoutes } from './routes/chat.js';
import { registerIdpRoutes } from './routes/idp.js';
import { registerMockControlRoutes } from './routes/mock-control.js';
import { registerSessionRoutes } from './routes/session.js';

export interface BuildOptions {
  env?: Partial<Env>;
  now?: () => Date;
  logger?: boolean;
}

const OPENAPI_CANDIDATES = ['openapi.yaml', '../openapi.yaml', '../../openapi.yaml'];

function readOpenApiSpec(): string | null {
  for (const candidate of OPENAPI_CANDIDATES) {
    const path = join(process.cwd(), candidate);
    if (existsSync(path)) return readFileSync(path, 'utf8');
  }
  return null;
}

function docsPage(publicUrl: string): string {
  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Compass mock backend — API</title>
  <style>
    body { margin: 0; font-family: Inter, Roboto, system-ui, sans-serif; background: #F5F5F5; color: #101C2B; }
    header { background: #253141; color: #fff; padding: 20px 32px; }
    header h1 { margin: 0; font-size: 20px; }
    header p { margin: 6px 0 0; color: #C9D1DA; font-size: 13px; }
    main { max-width: 980px; margin: 24px auto; padding: 0 20px 60px; }
    .card { background: #fff; border: 1px solid rgba(0,0,0,.12); border-radius: 8px; padding: 20px 24px; margin-bottom: 16px; }
    h2 { font-size: 16px; margin: 0 0 12px; }
    code, pre { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 13px; }
    pre { background: #101C2B; color: #E9ECEF; padding: 14px 16px; border-radius: 6px; overflow: auto; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid rgba(0,0,0,.08); vertical-align: top; }
    th { color: #5B6673; font-weight: 600; }
    .method { display: inline-block; min-width: 56px; font-weight: 700; color: #0961A4; }
    a { color: #0961A4; }
  </style>
</head>
<body>
  <header>
    <h1>Compass mock backend</h1>
    <p>REST + SSE + mock Keycloak · ${publicUrl}</p>
  </header>
  <main>
    <div class="card">
      <h2>Старт</h2>
      <pre>curl -X POST ${publicUrl}/realms/compass/protocol/openid-connect/token \\
  -H "Content-Type: application/x-www-form-urlencoded" \\
  -d "grant_type=password&client_id=compass-frontend&username=demo&password=demo"</pre>
      <p>Токен передавайте как <code>Authorization: Bearer &lt;access_token&gt;</code>.</p>
      <p>Машиночитаемый контракт: <a href="/openapi.yaml">/openapi.yaml</a></p>
    </div>
    <div class="card">
      <h2>Ключевые эндпоинты</h2>
      <table>
        <tr><th>Метод</th><th>Путь</th><th>Назначение</th></tr>
        <tr><td class="method">GET</td><td>/api/v1/session/context</td><td>Контекст сотрудника, ветвление 1.1 / 1.2</td></tr>
        <tr><td class="method">POST</td><td>/api/v1/session/context/manual</td><td>Ручной ввод должностей (Шаг 1.2)</td></tr>
        <tr><td class="method">POST</td><td>/api/v1/chat/init-assessment</td><td>SSE: поиск ДИ, приветствие, опросник</td></tr>
        <tr><td class="method">POST</td><td>/api/v1/chat/generate-draft</td><td>SSE: генерация черновика ИПР</td></tr>
        <tr><td class="method">POST</td><td>/api/v1/chat/refine-draft</td><td>SSE: цикл корректировки</td></tr>
        <tr><td class="method">POST</td><td>/api/v1/chat/confirm</td><td>Подтверждение плана (Этап 5)</td></tr>
        <tr><td class="method">GET</td><td>/api/v1/idp/draft</td><td>Текущий черновик</td></tr>
        <tr><td class="method">PUT</td><td>/api/v1/idp/draft</td><td>Сохранение ручных правок</td></tr>
        <tr><td class="method">POST</td><td>/api/v1/idp/export</td><td>Экспорт строго по контракту</td></tr>
        <tr><td class="method">GET</td><td>/api/v1/idp/dictionaries</td><td>Справочники и этапы</td></tr>
        <tr><td class="method">GET</td><td>/mock/state</td><td>Состояние сессии (dev)</td></tr>
        <tr><td class="method">POST</td><td>/mock/scenario</td><td>Переключение сценария (dev)</td></tr>
        <tr><td class="method">POST</td><td>/mock/reset</td><td>Сброс всех сессий (dev)</td></tr>
        <tr><td class="method">GET</td><td>/health</td><td>Проверка живости</td></tr>
      </table>
    </div>
  </main>
</body>
</html>`;
}

export async function buildApp(options: BuildOptions = {}): Promise<FastifyInstance> {
  const env = loadEnv(process.env, options.env ?? {});
  const now = options.now ?? ((): Date => new Date());
  const enableLogger = options.logger ?? env.logLevel !== 'silent';

  const app = Fastify({
    logger: enableLogger ? { level: env.logLevel } : false,
    bodyLimit: 2 * 1024 * 1024,
  });

  await app.register(cors, {
    origin: env.corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'Accept', 'X-Requested-With'],
    exposedHeaders: ['Content-Type'],
    maxAge: 3600,
  });
  await app.register(formbody);

  const keys = await createSigningKeys();
  const authStore = new AuthStore();
  const store = new SessionStore(env.legacyReturnUrl, now);
  const guard = createAuthGuard(env, keys);

  app.addHook('onRequest', async (request) => {
    request.auth = null;
  });

  app.get('/health', async () => ({
    status: 'ok',
    service: 'compass-mock-backend',
    time: now().toISOString(),
    realm: env.realm,
    clientId: env.clientId,
    authRequired: env.requireAuth,
    issuer: `${env.publicUrl}/realms/${env.realm}`,
  }));

  registerKeycloakRoutes(app, { env, keys, authStore });
  registerSessionRoutes(app, { env, store, guard });
  registerChatRoutes(app, { env, store, guard, now });
  registerIdpRoutes(app, { env, store, guard, now });
  registerMockControlRoutes(app, { store, guard });

  app.get('/openapi.yaml', async (_request, reply) => {
    const spec = readOpenApiSpec();
    if (!spec) {
      return reply.code(404).send({ error: 'not_found', message: 'openapi.yaml не найден рядом с процессом' });
    }
    return reply.type('application/yaml; charset=utf-8').send(spec);
  });

  app.get('/docs', async (_request, reply) => reply.type('text/html; charset=utf-8').send(docsPage(env.publicUrl)));
  app.get('/', async (_request, reply) => reply.redirect('/docs', 302));

  app.setNotFoundHandler(async (request, reply) =>
    reply.code(404).send({
      error: 'not_found',
      message: `Маршрут ${request.method} ${request.url} не реализован в моке`,
    }),
  );

  app.setErrorHandler(async (error: FastifyError, request, reply) => {
    request.log.error({ err: error }, 'unhandled mock error');
    const status = error.statusCode && error.statusCode >= 400 ? error.statusCode : 500;
    return reply.code(status).send({
      error: status === 500 ? 'internal_error' : 'request_error',
      message: error.message,
    });
  });

  return app;
}
