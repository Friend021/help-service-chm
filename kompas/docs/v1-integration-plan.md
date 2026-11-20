# План интеграции: новый фронт (frontend-v2) + наш Spring-бэк

Цель: новый Angular-фронт (`kompas/frontend-v2`, писался под mock-бэк) работает с НАШИМ
боевым Spring-бэком (`kompas/backend`) и его живым LLM. Авторизация — Keycloak (пока
dev mock-Keycloak из `kompas/auth-mock` на `:3000`, issuer `http://localhost:3000/realms/compass`).

Подход: НЕ трогаем существующий контракт `/api/*` (легаси вход по HS256-токену). ДОБАВЛЯЕМ
новый слой `/api/v1/*` под пакетом `ru.cft.kompas.v1.*`, авторизация по Keycloak RS256.

Точные JSON-формы (поля, справочники, SSE-события, валидация экспорта) — сверять с
mock-реализацией в `kompas/auth-mock/src` (это копия того же mock-бэка).

## Решения по спорным местам (приняты)
- Gap #3 `task.comment`/`commentAuthor`/`commentCreatedAt`, Gap #4 `plan.mainGoal`:
  ДОБАВИТЬ колонки через миграцию `V5__v1_plan_fields.sql` (`idp.main_goal TEXT`,
  `development_action.comment TEXT`, `comment_author TEXT`, `comment_created_at TIMESTAMP`)
  + поля в сущностях `Idp`/`DevelopmentAction`. Round-trip без потерь.
- Gap #2 инструменты: `GET /idp/dictionaries` и маппер отдают НАШИ названия
  (`DevelopmentInstrument.getTitle()`). Фронт не должен хардкодить строки.
- Gap #5 сценарий `known_employee`: сеять демо-должности Middle→Senior Frontend Developer
  для свежего Keycloak-пользователя, чтобы ветка «Шаг 1.1» работала.
- Gap #1 `DIALOG_STATE`: синтезировать грубое состояние из стадии оркестратора.

## Keycloak RS256 для /api/v1/** (подход b — Nimbus-фильтр)
- Gradle: `implementation 'com.nimbusds:nimbus-jose-jwt'` (версия из Spring BOM).
- `security/AccessTokenFilter.shouldNotFilter`: добавить `if (path.startsWith("/api/v1/")) return true;`
  — единственная правка легаси.
- Новые: `v1/security/KeycloakJwtVerifier` (Nimbus `DefaultJWTProcessor`, `RS256`,
  `RemoteJWKSet(jwksUri)` — сам рефетчит JWKS при неизвестном kid), `KeycloakPrincipal`
  (record sub/name/email/roles + ATTRIBUTE), `KeycloakAuthFilter extends OncePerRequestFilter`
  (shouldNotFilter: только `/api/v1/`, пропускать OPTIONS; 401 JSON как в легаси),
  `v1/config/V1SecurityConfig` (FilterRegistrationBean, urlPatterns `/api/v1/*`, order 0,
  **setAsyncSupported(true)** — обязательно для SSE).
- `KompasProperties`: блок `keycloak` — issuerUri (`http://localhost:3000/realms/compass`),
  jwksUri (`${issuerUri}/protocol/openid-connect/certs`), audience (`compass-frontend`),
  clockSkew 5s. В `application.yml` под `kompas.keycloak.*` + env `KOMPAS_KEYCLOAK_*`.
  Принимать client в `aud` ИЛИ `azp` (mock кладёт aud=clientId).
- CORS уже покрыт `addCorsMappings("/api/**")`. allowCredentials НЕ нужен (bearer, не cookie).

## Эндпоинты /api/v1 (точные формы — из auth-mock/src)
- GET  /session/context (?scenario=) → контекст + стадия; ветки known/new.
- POST /session/context/manual {currentPosition,targetPosition}
- GET  /idp/dictionaries → {directions:string[], priorities:[{rank,label}],
       developmentTools:string[], stages:[{stage,stepNumber,label,totalSteps}]}
- GET  /idp/draft → {plan, isValid}
- PUT  /idp/draft {plan}
- POST /idp/export {plan} → {success, returnUrl} (422 при неполном плане)
- GET  /chat/messages → история
- POST /chat/confirm {plan?}
- SSE POST /chat/init-assessment, /generate-draft {ratings:[{skillId,rating}]},
      /refine-draft {message}, /dialog {message?}

SSE события (event:name + data:{...,"type":name}): STAGE_UPDATE{stage,stepNumber,totalSteps},
MESSAGE_DELTA{messageId,delta}, QUESTIONNAIRE_READY{skills:[{skillId,skillName,description,rating}]},
PLAN_DRAFT_UPDATE{plan,validationErrors?}, DIALOG_STATE{active,step,answered,total,suggestions?},
DONE, ERROR{code,message}.

Модель плана фронта: {mainGoal, directions:[{rank(0..2),goal,description,
tasks:[{developmentTool,comment,deadLine(ISO8601 UTC Z),description}]}]}.

## Маппинг плана (PlanMapper) фронт ⇄ бэк
- direction.goal ⇄ IdpPriority.goalCategory — 1:1 (11 значений совпадают; normalize через GoalCategoryCatalog).
- direction.description ⇄ IdpPriority.developmentGoal.
- direction.rank(0,1,2) ⇄ IdpPriority.orderNo(1-based): out rank=clamp(orderNo-1,0,2); in orderNo=rank+1.
- task.description ⇄ DevelopmentAction.action.
- task.developmentTool ⇄ DevelopmentAction.instrument: out getTitle(); in DevelopmentInstrument.byTitle(fallback WORKPLACE).
- task.deadLine(ISO Z) ⇄ DevelopmentAction.dueDate(LocalDate): out dueDate.atTime(12,0).atOffset(UTC).toInstant();
  in OffsetDateTime.parse(...).atZoneSameInstant(UTC).toLocalDate(). НЕ через IdpService.parseDate.
- task.comment* → новые колонки (см. Gap #3). plan.mainGoal → новая колонка (Gap #4).
- activityCode: у фронта нет — сохранять по возможности, иначе потеря.
- Читать через IdpView/IdpViewAssembler (имена компетенций готовы). API: V1Plan toPlan(IdpView);
  DraftDto toDraft(V1Plan, targetRoleTitle).

## Дэкрипт SSE-моста к реальному оркестратору
Стадии DialogStage→фронт (totalSteps=5): CONTEXT→STAGE_1_CONTEXT(1);
GAP_ANALYSIS/INTERESTS→STAGE_2_QUESTIONNAIRE(2); DRAFT→STAGE_3_DRAFT_GEN(3);
REFINE→STAGE_4_REFINEMENT(4); FINALIZE→STAGE_5_COMPLETED(5).

- init-assessment: без LLM. Опросник из CompetencyRepository.findByRoleIdOrderByCodeAsc(targetRoleId).
  STAGE_UPDATE(2)→MESSAGE_DELTA(канон. текст)→QUESTIONNAIRE_READY{skills}→DONE.
  Если нет target role → терминальный ERROR (context_incomplete, 409-смысл).
- generate-draft: НАСТОЯЩИЙ AI. В @Transactional на async-потоке: load session; собрать user-сообщение
  из ratings; session.setStage(DRAFT)+save; orchestrator.handle(session, msg) (авто-второй проход
  заполняет IDP); turn.idp()→V1Plan в той же транзакции. STAGE_UPDATE(3)→MESSAGE_DELTA(assistant)→
  PLAN_DRAFT_UPDATE{plan}→STAGE_UPDATE(4)→DONE.
- refine-draft: orchestrator.handle(session, message) (REFINE). STAGE_UPDATE(4)→PLAN_DRAFT_UPDATE→MESSAGE_DELTA→DONE.
- dialog: message==null→orchestrator.start(session) иначе handle. STAGE_UPDATE→MESSAGE_DELTA→PLAN_DRAFT_UPDATE→DIALOG_STATE→DONE.

SseEmitter pattern: timeout 240s (>LLM 90s с ретраями). Первым делом послать STAGE_UPDATE (чтобы
байты ушли в пределах 12с таймаута фронта), потом блокирующий LLM на executor-потоке, потом чанкать
assistant-текст в MESSAGE_DELTA по N слов (kompas.v1.stream-chunk-words=3, задержка 35мс, одинаковый messageId).
НЕ передавать JPA-сущности между потоками (open-in-view:false) — только id внутрь, DTO наружу,
всё в одной @Transactional на worker-потоке. Executor: ThreadPoolTaskExecutor (core 4,max 16,queue 50),
не ForkJoinPool. onTimeout→complete, onError→noop.

## Справочники (из существующих данных бэка)
directions = GoalCategoryCatalog.all() (11); priorities=[{0,"Высокий"},{1,"Средний"},{2,"Низкий"}];
developmentTools = DevelopmentInstrument.values().map(getTitle) (3); stages = 6 строк STAGE_LABELS (из auth-mock idp.ts), totalSteps=5.
directions/developmentTools — голые строки (как в mock).

## Экспорт → {success,returnUrl}
Валидация «полноты» плана (как strict-схема mock: ≥1 direction, ≥1 task, непустые
mainGoal/description/developmentTool/deadLine) → при ошибке 422 {success:false,...} через v1-advice.
Успех: PlanMapper.toDraft → idpService.applyDraft(idp,draft,targetRoleId) →
returnUrl = handoverTokenIssuer.issueUrl(idpViewAssembler.assemble(idp)); session→STAGE_5_COMPLETED.

## Вехи (компилировать ./gradlew compileJava после каждой)
- M1 Auth + статические чтения (без AI): Nimbus, KompasProperties.keycloak, фильтры/конфиг,
  правка AccessTokenFilter, V1SessionService, context+manual, dictionaries.
- M2 Draft get/put (без AI): PlanMapper, миграция V5, поля сущностей.
- M3 Первый SSE без LLM: init-assessment (V1AsyncConfig, SseStreamer, SseEvents, V1QuestionnaireService).
- M4 AI SSE: generate-draft (мост к оркестратору).
- M5 refine-draft + dialog + chat/messages + confirm.
- M6 export (валидация + HandoverTokenIssuer).

## Риски
setAsyncSupported(true) на Keycloak-фильтре (иначе SSE виснет); dueDate LocalDate (конвертить в маппере);
JPA через границу потоков (LazyInit) — только id внутрь/DTO наружу; CORS для event-stream (Spring сам,
через addCorsMappings); первый STAGE_UPDATE до блокирующего LLM; mock-Keycloak перегенерит ключи при
рестарте (RemoteJWKSet сам рефетчит).
