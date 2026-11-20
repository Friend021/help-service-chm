# Compass — mock backend

Отдельный HTTP-мок бэкенда для будущего Angular SPA «Компас» (ИПР).
Реализует весь сценарий этапов 1–5 из ТЗ: REST, SSE-стриминг, справочники,
строгую валидацию экспорта и эмуляцию Keycloak (RS256 + JWKS + OIDC discovery).

Задача мока — чтобы фронтенд работал с настоящим `HttpClient` и `fetch`,
а переключение на боевой бэкенд сводилось к смене двух URL.

## Стек

- Node.js 22+ (проверено на 24), TypeScript strict, ESM
- Fastify 5, `@fastify/cors`, `@fastify/formbody`
- `jose` — подпись/проверка JWT, `zod` — валидация контрактов
- Vitest — 35 тестов (auth, ветвления, SSE, экспорт, OpenAPI)

## Быстрый старт

```bash
cd mock-backend
npm install
npm run dev          # http://localhost:3000/docs
```

Production-режим:

```bash
npm run build
npm start
```

Docker:

```bash
docker compose up --build
```

### Получить токен

```bash
curl -X POST http://localhost:3000/realms/compass/protocol/openid-connect/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=password&client_id=compass-frontend&username=demo&password=demo"
```

Пользователи: `demo / demo` (сотрудник), `hr / hr` (HR).
Токен передаётся как `Authorization: Bearer <access_token>`.

Мок-Keycloak поддерживает:

- `authorization_code` + PKCE (`S256` / `plain`) и HTML-страницу входа;
- `password`, `refresh_token` (с ротацией), `client_credentials`;
- OIDC discovery, JWKS, `userinfo`, `logout`.

То есть `keycloak-js` можно направлять на мок без правок кода:

```ts
new Keycloak({
  url: 'http://localhost:3000',
  realm: 'compass',
  clientId: 'compass-frontend',
});
```

## Эндпоинты

| Метод | Путь | Назначение |
|---|---|---|
| GET | `/api/v1/session/context` | Контекст сотрудника, ветвление Шаг 1.1 / 1.2 |
| POST | `/api/v1/session/context/manual` | Ручной ввод текущей и целевой должности |
| GET | `/api/v1/idp/dictionaries` | 11 направлений, 3 приоритета, 3 инструмента, этапы |
| GET | `/api/v1/chat/messages` | История сообщений сессии |
| POST | `/api/v1/chat/init-assessment` | **SSE**: поиск ДИ, приветствие, опросник |
| POST | `/api/v1/chat/generate-draft` | **SSE**: генерация черновика ИПР |
| POST | `/api/v1/chat/refine-draft` | **SSE**: цикл корректировки |
| POST | `/api/v1/chat/confirm` | Подтверждение плана (этап 5) |
| GET | `/api/v1/idp/draft` | Текущий черновик + `isValid` |
| PUT | `/api/v1/idp/draft` | Сохранить ручные правки из панели |
| POST | `/api/v1/idp/export` | Экспорт строго по контракту «План развития» |
| GET | `/mock/state` | Снимок состояния сессии |
| POST | `/mock/scenario` | `known_employee` ↔ `new_employee` |
| POST | `/mock/reset` | Очистить все сессии |
| GET | `/health` | Живость |
| GET | `/openapi.yaml`, `/docs` | Контракт и страница документации |

Полный контракт — [`openapi.yaml`](./openapi.yaml). Документация — http://localhost:3000/docs.

## Ветвления сценария

**Шаг 1.1 — контекст найден (по умолчанию).**
`GET /session/context` возвращает `Middle Frontend Developer → Senior Frontend Developer`,
сессия сразу на `STAGE_2_QUESTIONNAIRE`.

**Шаг 1.2 — новый сотрудник.**
Переключение:

```bash
curl -X POST http://localhost:3000/mock/scenario \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"scenario":"new_employee"}'
```

`currentPosition` и `targetPosition` становятся `null`, сессия уходит на
`STAGE_1_2_ONBOARDING`, а `init-assessment` отвечает `409 context_incomplete`
до вызова `POST /session/context/manual`.

Сценарий можно переключить и запросом `GET /session/context?scenario=new_employee`.

## Формат SSE

`Content-Type: text/event-stream`, блоки `event:` + `data:`.
`data` — JSON с полем `type`. Последовательность для генерации черновика:

```
event: STAGE_UPDATE
data: {"type":"STAGE_UPDATE","stage":"STAGE_3_DRAFT_GEN","stepNumber":3,"totalSteps":5}

event: MESSAGE_DELTA
data: {"type":"MESSAGE_DELTA","messageId":"...","delta":"Спасибо, оценки "}

event: PLAN_DRAFT_UPDATE
data: {"type":"PLAN_DRAFT_UPDATE","plan":{"mainGoal":"...","directions":[...]}}

event: DONE
data: {"type":"DONE"}
```

Типы событий: `STAGE_UPDATE`, `MESSAGE_DELTA`, `QUESTIONNAIRE_READY`,
`PLAN_DRAFT_UPDATE`, `DONE`, `ERROR`. `MESSAGE_DELTA` приходит порциями
по 2–4 слова; `messageId` стабилен для всего сообщения.

### Чтение стрима в Angular

`EventSource` не умеет POST и `Authorization`, поэтому используем `fetch` + `ReadableStream`
(как и для боевого бэкенда по ТЗ):

```ts
async streamPost(url: string, body: unknown, token: string, signal: AbortSignal) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify(body),
    signal,
  });
  if (!response.ok || !response.body) throw new Error(`SSE failed: ${response.status}`);

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let boundary = buffer.indexOf('\n\n');
    while (boundary !== -1) {
      const block = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const data = block
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trim())
        .join('\n');
      if (data) yield JSON.parse(data);
      boundary = buffer.indexOf('\n\n');
    }
  }
}
```

## Контракт экспорта

`POST /api/v1/idp/export` принимает только:

```json
{
  "plan": {
    "mainGoal": "string",
    "directions": [
      {
        "rank": 0,
        "goal": "string",
        "description": "string",
        "tasks": [
          {
            "developmentTool": "string",
            "comment": "string",
            "deadLine": "2026-10-16T07:32:12.162Z",
            "description": "string"
          }
        ]
      }
    ]
  }
}
```

Проверяется: непустые `mainGoal` / `directions` / `tasks`, `rank ∈ {0,1,2}`,
`goal` и `developmentTool` из справочников, `deadLine` — ISO 8601 UTC.
При ошибке — `422` и список `{ path, message }`, например
`plan.directions.0.tasks.0.deadLine`.

Успех: `{ "success": true, "returnUrl": "..." }` — фронт делает
`window.location.href = returnUrl`. Адрес задаётся через `LEGACY_RETURN_URL`.

## Как мок обновляет план

Генерация детерминированная (никакой внешней LLM):

- навыки с оценкой ниже 4 группируются в направления;
- приоритет выше у направлений с самыми низкими оценками;
- срок: 3 месяца для оценки 1–2, 6 месяцев для 3;
- если все оценки ≥ 4 — план на поддержание компетенций.

Корректировка в чате разбирает сообщение по правилам:

| Запрос | Результат |
|---|---|
| `поставь высокий приоритет направлению 2` | `rank` указанного направления |
| `сдвинь дедлайн на декабрь 2026` | все сроки (или одного направления) |
| `замени инструмент на рабочие курсы` | `developmentTool` |
| `добавь направление по управленческим компетенциям` | новое направление |
| `добавь задачу по микрофронтендам` | новое действие |
| `удали действие` | удаление (последнее не удаляется) |
| всё остальное | уточнение описания и комментария |

## Переменные окружения

| Переменная | По умолчанию | Описание |
|---|---|---|
| `PORT` / `HOST` | `3000` / `0.0.0.0` | Адрес сервера |
| `PUBLIC_URL` | `http://localhost:3000` | Публичный адрес, попадает в issuer |
| `REALM` | `compass` | Realm mock-Keycloak |
| `CLIENT_ID` | `compass-frontend` | Client id |
| `CLIENT_SECRET` | — | Если задан, проверяется в token endpoint |
| `ACCESS_TOKEN_TTL_SECONDS` | `300` | Время жизни access token |
| `REFRESH_TOKEN_TTL_SECONDS` | `1800` | Время жизни refresh token |
| `ALLOWED_REDIRECT_ORIGINS` | `http://localhost:4200` | Белый список origin для redirect_uri |
| `CORS_ORIGINS` | `http://localhost:4200` | Разрешённые origin'ы SPA |
| `LEGACY_RETURN_URL` | `https://re-team.internal/...` | Куда вернуть после экспорта |
| `INITIAL_DELAY_MS` | `400` | Пауза «LLM думает» |
| `STREAM_DELAY_MS` | `35` | Задержка между чанками |
| `STREAM_CHUNK_WORDS` | `3` | Слов в чанке |
| `REQUIRE_AUTH` | `true` | `false` — отключить проверку Bearer |

## Подключение Angular SPA

`env.js` фронтенда:

```js
window.__env = {
  apiUrl: 'http://localhost:3000/api/v1',
  keycloakUrl: 'http://localhost:3000',
  keycloakRealm: 'compass',
  keycloakClientId: 'compass-frontend',
  useMockBackend: true,
};
```

`auth.interceptor.ts` работает без изменений: токен из `keycloak-js`
(в мок-режиме — из password grant) уходит в `Authorization`.

### Переключение на боевой бэкенд

1. `apiUrl` → адрес боевого API.
2. `keycloakUrl` / `realm` / `clientId` → боевой Keycloak.
3. `useMockBackend` → `false`.
4. Убедиться, что боевой бэкенд отдаёт те же SSE-события и поля.

Эндпоинты `/mock/*` в боевом контракте отсутствуют — их использует только dev-панель.

## Тесты

```bash
npm test
```

- `src/keycloak/keycloak.test.ts` — discovery, JWKS, password/refresh, PKCE, redirect_uri, 401.
- `src/routes/workflow.test.ts` — обе ветки этапа 1, SSE этапов 2–4, подтверждение, экспорт, reset.
- `src/domain/plan-refiner.test.ts` — правила корректировки плана.

## Структура

```
src/
├── app.ts                 # сборка Fastify, CORS, health, /docs
├── server.ts              # запуск и graceful shutdown
├── config.ts              # env
├── sse.ts                 # SSE writer и стриминг текста
├── types.ts               # доменные контракты и события
├── domain/
│   ├── dictionaries.ts    # строгие справочники
│   ├── schemas.ts         # zod-схемы запросов
│   ├── seed.ts            # пользователи, контекст, навыки
│   ├── store.ts           # in-memory сессии
│   ├── plan-generator.ts  # черновик из оценок
│   └── plan-refiner.ts    # правки из чата
├── keycloak/              # mock OIDC provider
└── routes/                # session, chat, idp, mock-control
```

## Ограничения

- Состояние только в памяти: рестарт очищает сессии.
- Один процесс, без кластера: сессии не шарятся между инстансами.
- LLM имитируется детерминированными правилами, а не моделью.
- Ключи подписи перегенерируются при старте — старые токены становятся невалидными.
