package ru.cft.kompas.v1.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import ru.cft.kompas.config.KompasProperties;
import ru.cft.kompas.dialog.DialogException;
import ru.cft.kompas.dialog.DialogOrchestrator;
import ru.cft.kompas.dialog.DialogTurn;
import ru.cft.kompas.dialog.DraftDto;
import ru.cft.kompas.domain.Competency;
import ru.cft.kompas.domain.DevelopmentInstrument;
import ru.cft.kompas.domain.DialogMessage;
import ru.cft.kompas.domain.DialogSession;
import ru.cft.kompas.domain.DialogStage;
import ru.cft.kompas.domain.Employee;
import ru.cft.kompas.domain.Idp;
import ru.cft.kompas.domain.IdpService;
import ru.cft.kompas.domain.JobPosition;
import ru.cft.kompas.domain.MessageRole;
import ru.cft.kompas.domain.SessionStatus;
import ru.cft.kompas.llm.ChatMessage;
import ru.cft.kompas.llm.LlmClient;
import ru.cft.kompas.llm.LlmParams;
import ru.cft.kompas.reference.GoalCategoryCatalog;
import ru.cft.kompas.repo.CompetencyRepository;
import ru.cft.kompas.repo.DialogMessageRepository;
import ru.cft.kompas.repo.EmployeeRepository;
import ru.cft.kompas.repo.IdpRepository;
import ru.cft.kompas.repo.JobPositionRepository;
import ru.cft.kompas.v1.WorkflowStage;
import ru.cft.kompas.v1.dto.Rating;
import ru.cft.kompas.v1.dto.V1ChatMessage;
import ru.cft.kompas.v1.dto.V1Direction;
import ru.cft.kompas.v1.dto.V1Plan;
import ru.cft.kompas.v1.dto.V1Task;
import ru.cft.kompas.v1.mapping.PlanMapper;
import ru.cft.kompas.v1.repo.V1DialogSessionRepository;

/**
 * Мост SSE-эндпоинтов чата к боевому оркестратору диалога.
 *
 * Каждый публичный метод @Transactional и исполняется на SSE-worker-потоке: только там
 * (при открытой транзакции, open-in-view=false) работает ленивая загрузка ИПР. Сущности
 * не покидают поток/транзакцию — наружу уходит материализованный {@link TurnResult}.
 * Контроллер передаёт сюда лишь строковый sub принципала, прочитанный на servlet-потоке.
 */
@Service
public class V1DialogService {

    private static final Logger log = LoggerFactory.getLogger(V1DialogService.class);

    /** Сколько попыток сгенерировать черновик у LLM, если ответ пуст/непарсибелен. */
    private static final int DRAFT_ATTEMPTS = 3;

    /** Минимум направлений развития в черновике ИПР: при меньшем числе генерацию повторяем. */
    private static final int MIN_DIRECTIONS = 3;

    /** maxTokens для генерации черновика ИПР (план крупнее опросника). */
    private static final int DRAFT_MAX_TOKENS = 3000;

    private static final String DRAFT_SYSTEM_PROMPT =
            "Ты — опытный наставник по развитию сотрудников. Ты составляешь индивидуальный план "
                    + "развития (ИПР), которым человек реально будет пользоваться: конкретные направления "
                    + "по реальным пробелам, измеримые цели и практические шаги. Планируешь развитие по "
                    + "модели 70/20/10 (рабочее место / через других / учебные программы). Пиши по-деловому и "
                    + "конкретно, без шаблонных формулировок.";

    /**
     * Модель развития 70/20/10 — методологический каркас, по которому ассистент распределяет
     * развивающие действия и подбирает конкретные приёмы внутри каждой из трёх форм
     * ({@link DevelopmentInstrument}). Проценты — ориентир по доле действий в плане.
     */
    private static final String DEV_MODEL_702010 =
            "Модель развития 70/20/10 — распредели развивающие действия примерно в этой пропорции и "
                    + "подбирай их из приёмов соответствующей формы:\n"
                    + "• «Развитие на рабочем месте» (≈70% действий): специальные задания и сверхзадачи "
                    + "(участие в проекте, требующем более высокого уровня компетенции); изучение новых "
                    + "технологий из проектов; углубление знаний используемых технологий; изменения в "
                    + "процессе работы, развивающие компетенцию.\n"
                    + "• «Развитие через других» (≈20%): обучение на опыте других (наблюдение за тем, у кого "
                    + "компетенция развита высоко); поиск обратной связи у коллег и подчинённых; коучинг; "
                    + "менторинг/наставничество; стажировка в другом подразделении.\n"
                    + "• «Развитие через учебные программы» (≈10%): курсы учебного центра и внешние программы; "
                    + "самообучение (литература, публикации); хакатоны, конференции, мастер-классы.";

    private static final String DRAFT_DONE_MESSAGE =
            "Собрал черновик ИПР по итогам вашей самооценки — приоритет на самых слабых компетенциях. "
                    + "Проверьте и при необходимости скорректируйте.";

    /** Сколько попыток применить правку через LLM, если ответ пуст/непарсибелен. */
    private static final int REFINE_ATTEMPTS = 2;

    /** maxTokens для доработки плана (возвращается весь обновлённый план). */
    private static final int REFINE_MAX_TOKENS = 3000;

    private static final String REFINE_SYSTEM =
            "Ты — помощник по редактированию индивидуального плана развития (ИПР). Пользователь просит "
                    + "внести правку — ты ВЫПОЛНЯЕШЬ её, меняя план, а не отказываешься и не переспрашиваешь, "
                    + "если запрос понятен. Возвращаешь ВЕСЬ обновлённый план и короткое подтверждение.";

    private static final String REFINE_DONE_FALLBACK = "Готово, внёс правку в план.";

    private final DialogOrchestrator orchestrator;
    private final EmployeeRepository employees;
    private final V1DialogSessionRepository sessions;
    private final DialogMessageRepository messages;
    private final CompetencyRepository competencies;
    private final JobPositionRepository positions;
    private final PlanMapper planMapper;
    private final LlmClient llmClient;
    private final KompasProperties properties;
    private final ObjectMapper objectMapper;
    private final GoalCategoryCatalog goalCategories;
    private final IdpService idpService;
    private final IdpRepository idps;

    public V1DialogService(DialogOrchestrator orchestrator,
                           EmployeeRepository employees,
                           V1DialogSessionRepository sessions,
                           DialogMessageRepository messages,
                           CompetencyRepository competencies,
                           JobPositionRepository positions,
                           PlanMapper planMapper,
                           LlmClient llmClient,
                           KompasProperties properties,
                           ObjectMapper objectMapper,
                           GoalCategoryCatalog goalCategories,
                           IdpService idpService,
                           IdpRepository idps) {
        this.orchestrator = orchestrator;
        this.employees = employees;
        this.sessions = sessions;
        this.messages = messages;
        this.competencies = competencies;
        this.positions = positions;
        this.planMapper = planMapper;
        this.llmClient = llmClient;
        this.properties = properties;
        this.objectMapper = objectMapper;
        this.goalCategories = goalCategories;
        this.idpService = idpService;
        this.idps = idps;
    }

    /** Материализованный результат хода: план уже DTO, сущности остались в транзакции. */
    public record TurnResult(String messageId, String assistantText, V1Plan plan, WorkflowStage stage) {
    }

    /**
     * generate-draft: собирает ПОЛЕЗНЫЙ черновик ИПР.
     *
     * Боевой провайдер — выделенный сильный промпт по самооценке (самые слабые компетенции →
     * направления с осмысленными категориями и практическими шагами), план применяется сразу.
     * mock-провайдер (офлайн/локально) остаётся на старом пути через оркестратор; на него же
     * откатываемся, если LLM не вернул пригодный план.
     */
    @Transactional
    public TurnResult generateDraft(String sub, List<Rating> ratings, String plannedTasks) {
        DialogSession session = requireSession(sub);
        if (session.getTargetRoleId() == null) {
            throw new DialogException("Целевая должность не определена. Сначала выполните Шаг 1.2.");
        }
        // Диагностика: ровно тот свободный текст задач, что уходит в промпт черновика
        // (помогает отличить ослышку STT от галлюцинации LLM). Виден в консоли бэка.
        log.info("generate-draft (сессия {}): ratings={}, plannedTasks=[{}]",
                session.getId(),
                ratings == null ? 0 : ratings.size(),
                plannedTasks == null ? "" : plannedTasks);

        if (!"mock".equals(llmClient.provider())) {
            try {
                TurnResult result = generateDraftViaLlm(session, ratings, plannedTasks);
                if (result != null) {
                    return result;
                }
                log.warn("LLM не вернул пригодный черновик ИПР — откат на оркестратор (сессия {})",
                        session.getId());
            } catch (RuntimeException e) {
                log.warn("Сбой генерации черновика ИПР через LLM — откат на оркестратор (сессия {}): {}",
                        session.getId(), e.getMessage());
            }
        }
        return generateDraftViaOrchestrator(session, ratings, plannedTasks);
    }

    /**
     * Старый путь: синтезирует user-реплику из самооценок, форсит стадию DRAFT и вызывает
     * оркестратор (авто-второй проход заполняет ИПР). Остаётся фолбэком и mock-веткой.
     */
    private TurnResult generateDraftViaOrchestrator(DialogSession session, List<Rating> ratings,
                                                    String plannedTasks) {
        String userMessage = buildRatingsMessage(session.getTargetRoleId(), ratings, plannedTasks);
        session.setStage(DialogStage.DRAFT);
        session.setStageTurns(0);
        sessions.save(session);

        DialogTurn turn = orchestrator.handle(session, userMessage);
        // Оркестратор не задаёт верхнеуровневую цель — персистим осмысленный дефолт,
        // чтобы он сохранился в БД и совпадал при перечитывании GET /idp/draft и экспорте.
        if (turn.idp() != null && turn.idp().getPriorities() != null
                && !turn.idp().getPriorities().isEmpty()
                && (turn.idp().getMainGoal() == null || turn.idp().getMainGoal().isBlank())) {
            turn.idp().setMainGoal(defaultMainGoal(session));
        }
        return materialize(turn, session);
    }

    /**
     * Боевой путь: один вызов LLM с выделенным промптом по профилю роли и самооценке,
     * разбор JSON в {@link V1Plan}, нормализация и прямое применение к ИПР сессии.
     *
     * @return материализованный результат или null, если план так и не собрался (→ фолбэк)
     */
    private TurnResult generateDraftViaLlm(DialogSession session, List<Rating> ratings,
                                           String plannedTasks) {
        Long roleId = session.getTargetRoleId();
        JobPosition targetRole = positions.findById(roleId)
                .orElseThrow(() -> new DialogException("Целевая роль не найдена в справочнике"));
        String roleTitle = targetRole.getTitle();

        List<ChatMessage> prompt = List.of(
                ChatMessage.system(DRAFT_SYSTEM_PROMPT),
                ChatMessage.user(buildDraftUserPrompt(targetRole, roleId, ratings, plannedTasks)));
        LlmParams params = LlmParams.of(properties.getLlm().getTemperature(), DRAFT_MAX_TOKENS);

        // Берём план с максимумом направлений среди попыток и повторяем, пока их меньше MIN_DIRECTIONS
        // (роль может не дать столько различных слабых компетенций — тогда применяем самый полный).
        V1Plan plan = null;
        for (int attempt = 1; attempt <= DRAFT_ATTEMPTS; attempt++) {
            String raw = llmClient.chat(prompt, params);
            V1Plan candidate = parseAndNormalize(raw, session);
            if (candidate == null) {
                log.warn("Черновик ИПР от LLM пуст/непарсибелен (попытка {} из {}, сессия {})",
                        attempt, DRAFT_ATTEMPTS, session.getId());
                continue;
            }
            if (plan == null || candidate.directions().size() > plan.directions().size()) {
                plan = candidate;
            }
            if (plan.directions().size() >= MIN_DIRECTIONS) {
                break;
            }
            log.warn("Черновик ИПР: направлений {} (нужно ≥{}), повтор (попытка {} из {}, сессия {})",
                    candidate.directions().size(), MIN_DIRECTIONS, attempt, DRAFT_ATTEMPTS, session.getId());
        }
        if (plan == null) {
            return null;
        }

        // Применяем план тем же механизмом, что и V1SessionService.applyPlan.
        Idp idp = idpService.getOrCreate(session.getEmployeeId(), session.getId(), roleId);
        DraftDto draft = planMapper.toDraft(plan, roleTitle);
        idpService.applyDraft(idp, draft, roleId);
        PlanMapper.persistExtras(idp, plan);
        idp = idps.save(idp);

        if (idp.getPriorities().isEmpty()) {
            // Все направления отфильтрованы при применении — пригодного плана нет.
            return null;
        }

        session.setStage(DialogStage.REFINE);
        session.setStageTurns(0);
        sessions.save(session);

        save(session.getId(), MessageRole.ASSISTANT, DRAFT_DONE_MESSAGE);
        log.info("Сессия {}: черновик ИПР собран выделенным промптом ({} направлений)",
                session.getId(), idp.getPriorities().size());

        // Перечитываем из ИПР, чтобы план отражал ровно то, что сохранилось.
        V1Plan persisted = withMainGoal(planMapper.toPlan(idp), session);
        return new TurnResult(UUID.randomUUID().toString(), DRAFT_DONE_MESSAGE, persisted,
                WorkflowStage.of(DialogStage.REFINE));
    }

    /**
     * refine-draft: реплика доработки плана.
     *
     * Боевой провайдер — выделенный промпт, который ПРИМЕНЯЕТ правку к текущему ИПР (добавляет,
     * меняет или удаляет направления и действия) и возвращает весь обновлённый план. mock-провайдер
     * остаётся на старом пути через оркестратор; на него же откатываемся, если LLM не вернул
     * пригодный план.
     */
    @Transactional
    public TurnResult refine(String sub, String message) {
        DialogSession session = requireSession(sub);

        if (!"mock".equals(llmClient.provider())) {
            try {
                TurnResult result = refineViaLlm(session, message);
                if (result != null) {
                    return result;
                }
                log.warn("LLM не вернул пригодную правку плана — откат на оркестратор (сессия {})",
                        session.getId());
            } catch (RuntimeException e) {
                log.warn("Сбой доработки плана через LLM — откат на оркестратор (сессия {}): {}",
                        session.getId(), e.getMessage());
            }
        }
        return refineViaOrchestrator(session, message);
    }

    /** Старый путь доработки: оркестратор пересобирает план. Остаётся фолбэком и mock-веткой. */
    private TurnResult refineViaOrchestrator(DialogSession session, String message) {
        DialogTurn turn = orchestrator.handle(session, message);
        return materialize(turn, session);
    }

    /**
     * Боевой путь доработки: один вызов LLM с текущим планом и запросом пользователя, который
     * ПРИМЕНЯЕТ правку и возвращает весь обновлённый план + короткое подтверждение, разбор
     * {@code {"reply":..,"plan":..}}, нормализация как у черновика и прямое применение к ИПР.
     *
     * @return материализованный результат или null, если план так и не собрался (→ фолбэк)
     */
    private TurnResult refineViaLlm(DialogSession session, String message) {
        Long roleId = session.getTargetRoleId();
        String roleTitle = roleId == null ? null
                : positions.findById(roleId).map(JobPosition::getTitle).orElse(null);

        Idp idp = idpService.getOrCreate(session.getEmployeeId(), session.getId(), roleId);
        String currentPlanJson;
        try {
            currentPlanJson = objectMapper.writeValueAsString(planMapper.toPlan(idp));
        } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
            log.warn("Не удалось сериализовать текущий план ИПР для доработки (сессия {}): {}",
                    session.getId(), e.getMessage());
            return null;
        }

        List<ChatMessage> prompt = List.of(
                ChatMessage.system(REFINE_SYSTEM),
                ChatMessage.user(buildRefineUserPrompt(currentPlanJson, message, roleId)));
        LlmParams params = LlmParams.of(properties.getLlm().getTemperature(), REFINE_MAX_TOKENS);

        V1Plan plan = null;
        String reply = null;
        for (int attempt = 1; attempt <= REFINE_ATTEMPTS && plan == null; attempt++) {
            String raw = llmClient.chat(prompt, params);
            Refined refined = parseRefine(raw, session, idp);
            if (refined == null) {
                log.warn("Правка плана от LLM пуста/непарсибельна (попытка {} из {}, сессия {})",
                        attempt, REFINE_ATTEMPTS, session.getId());
                continue;
            }
            plan = refined.plan();
            reply = refined.reply();
        }
        if (plan == null) {
            return null;
        }

        // Применяем обновлённый план тем же механизмом, что и путь черновика.
        DraftDto draft = planMapper.toDraft(plan, roleTitle);
        idpService.applyDraft(idp, draft, roleId);
        PlanMapper.persistExtras(idp, plan);
        idp = idps.save(idp);

        if (idp.getPriorities().isEmpty()) {
            // Все направления отфильтрованы при применении — пригодного плана нет.
            return null;
        }

        session.setStage(DialogStage.REFINE);
        sessions.save(session);

        String assistantText = reply == null || reply.isBlank() ? REFINE_DONE_FALLBACK : reply;
        // Фиксируем обе стороны реплики, как обычный ход чата: сперва запрос, затем ответ.
        save(session.getId(), MessageRole.USER, message);
        save(session.getId(), MessageRole.ASSISTANT, assistantText);
        log.info("Сессия {}: правка применена выделенным промптом ({} направлений)",
                session.getId(), idp.getPriorities().size());

        // Перечитываем из ИПР, чтобы план отражал ровно то, что сохранилось.
        V1Plan persisted = withMainGoal(planMapper.toPlan(idp), session);
        return new TurnResult(UUID.randomUUID().toString(), assistantText, persisted,
                WorkflowStage.of(DialogStage.REFINE));
    }

    /** Разобранный ответ доработки: короткое подтверждение и нормализованный план. */
    private record Refined(String reply, V1Plan plan) {
    }

    /**
     * Разбирает JSON-ответ доработки вида {@code {"reply":"..","plan":{..}}}: снимает ограждения
     * кода, берёт объект от первого '{' до последнего '}', читает reply и plan (при отсутствии
     * ключа plan пытается разобрать весь объект как план), нормализует план как путь черновика.
     *
     * @return разобранный результат или null, если разбор не удался или направлений нет
     */
    private Refined parseRefine(String raw, DialogSession session, Idp idp) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        String json = raw.trim();
        if (json.startsWith("```")) {
            int firstBreak = json.indexOf('\n');
            if (firstBreak >= 0) {
                json = json.substring(firstBreak + 1);
            }
            int fence = json.lastIndexOf("```");
            if (fence >= 0) {
                json = json.substring(0, fence);
            }
        }
        int start = json.indexOf('{');
        int end = json.lastIndexOf('}');
        if (start < 0 || end <= start) {
            return null;
        }
        json = json.substring(start, end + 1);

        JsonNode root;
        try {
            root = objectMapper.readTree(json);
        } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
            log.warn("Не удалось разобрать JSON правки плана от LLM: {}", e.getMessage());
            return null;
        }

        String reply = root.hasNonNull("reply") ? root.get("reply").asText() : null;

        V1Plan parsed;
        try {
            JsonNode planNode = root.get("plan");
            // На случай, если модель вернула план без обёртки — разбираем весь объект как план.
            parsed = objectMapper.treeToValue(planNode != null ? planNode : root, V1Plan.class);
        } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
            log.warn("Не удалось разобрать план из правки LLM: {}", e.getMessage());
            return null;
        }

        V1Plan normalized = normalizeRefinedPlan(parsed, session, idp);
        if (normalized == null) {
            return null;
        }
        return new Refined(reply, normalized);
    }

    /**
     * Нормализует обновлённый план как путь черновика: клампит rank, приводит инструменты задач
     * к справочным и сдвигает прошедшие сроки. mainGoal берётся из плана, иначе — из текущего ИПР,
     * иначе — осмысленный дефолт.
     *
     * @return нормализованный план или null, если направлений нет
     */
    private V1Plan normalizeRefinedPlan(V1Plan parsed, DialogSession session, Idp idp) {
        if (parsed == null || parsed.directions() == null || parsed.directions().isEmpty()) {
            return null;
        }
        List<V1Direction> directions = new ArrayList<>();
        for (V1Direction direction : parsed.directions()) {
            if (direction == null) {
                continue;
            }
            directions.add(new V1Direction(
                    clampRank(direction.rank()),
                    direction.goal(),
                    direction.description(),
                    sanitizeCompetencyCodes(direction.competencyCodes(), session.getTargetRoleId()),
                    normalizeTasks(direction.tasks())));
        }
        directions = mergeByCompetency(directions);
        if (directions.isEmpty()) {
            return null;
        }
        String mainGoal;
        if (parsed.mainGoal() != null && !parsed.mainGoal().isBlank()) {
            mainGoal = parsed.mainGoal();
        } else if (idp.getMainGoal() != null && !idp.getMainGoal().isBlank()) {
            mainGoal = idp.getMainGoal();
        } else {
            mainGoal = defaultMainGoal(session);
        }
        return new V1Plan(mainGoal, directions);
    }

    /** USER-промпт доработки: текущий план, справочники категорий и инструментов, запрос пользователя. */
    private String buildRefineUserPrompt(String currentPlanJson, String message, Long roleId) {
        java.time.LocalDate today = java.time.LocalDate.now();
        String todayStr = today.toString();
        String exampleDeadline = today.plusMonths(3).toString() + "T12:00:00Z";

        StringBuilder categories = new StringBuilder();
        for (String category : goalCategories.all()) {
            categories.append("- ").append(category).append('\n');
        }
        StringBuilder tools = new StringBuilder();
        for (DevelopmentInstrument instrument : DevelopmentInstrument.values()) {
            tools.append("- ").append(instrument.getTitle()).append('\n');
        }
        StringBuilder competencies = new StringBuilder();
        for (Map.Entry<String, String> entry : competencyNames(roleId).entrySet()) {
            competencies.append("- ").append(entry.getKey()).append(" — ").append(entry.getValue()).append('\n');
        }

        return "Текущий черновик ИПР (JSON):\n" + currentPlanJson + "\n\n"
                + "Доступные КАТЕГОРИИ направления (поле \"goal\" — выбирай подходящую по смыслу и "
                + "КОПИРУЙ её ДОСЛОВНО из списка, символ в символ, без перефразирования):\n"
                + categories
                + "Доступные ИНСТРУМЕНТЫ развития (поле \"developmentTool\" — строго из списка):\n"
                + tools
                + "КОМПЕТЕНЦИИ роли (код — название). Поле \"competencyCodes\" каждого направления — 1–2 кода "
                + "строго из этого списка:\n"
                + competencies
                + "\n" + DEV_MODEL_702010 + "\n"
                + "Новые/изменённые действия подбирай из приёмов соответствующей формы и держи общий баланс "
                + "плана близким к 70/20/10.\n\n"
                + "Сегодняшняя дата: " + todayStr + ". Любые новые/изменённые сроки — будущие (после сегодня), "
                + "в пределах 12 месяцев, в формате ISO-8601 UTC (например \"" + exampleDeadline + "\").\n\n"
                + "Запрос пользователя:\n\"" + message + "\"\n\n"
                + "Примени этот запрос к плану: добавь, измени или удали направления и действия так, как просит "
                + "пользователь. Если тема запроса отсутствует в справочниках — всё равно добавь соответствующее "
                + "направление/действие, подобрав ближайшую по смыслу категорию из списка и инструмент из списка. "
                + "Не отказывайся и не задавай уточняющих вопросов, если запрос понятен. Направления и действия, "
                + "которых правка НЕ касается, сохрани без изменений.\n\n"
                + "ОБЪЁМ ПРАВКИ НАПРАВЛЕНИЯ — различай два случая:\n"
                + "1) ОБЫЧНАЯ правка («поправь описание», «измени сроки», «добавь/убери действие», «переформулируй») "
                + "— меняй только то, что просят; категорию (goal) и компетенцию (competencyCodes) этого направления "
                + "СОХРАНЯЙ прежними.\n"
                + "2) ПОЛНАЯ ЗАМЕНА («полностью измени направление N», «целиком», «замени направление N», «сделай "
                + "другое направление», «под другую компетенцию/тему») — пересобери это направление ЦЕЛИКОМ и выдай "
                + "НОВЫЕ: категорию (goal из списка), описание (description), компетенцию (competencyCodes — ДРУГОЙ код "
                + "роли, по возможности ещё не использованный другими направлениями) и все действия (tasks). "
                + "НЕ ограничивайся переформулировкой описания и задач и НЕ оставляй прежние категорию и компетенцию — "
                + "при полной замене они обязаны стать другими.\n\n"
                + "Верни СТРОГО JSON:\n"
                + "{\"reply\":\"<одно короткое предложение: что именно изменил>\",\"plan\":{\"mainGoal\":\"...\","
                + "\"directions\":[{\"rank\":0,\"goal\":\"...\",\"description\":\"...\","
                + "\"competencyCodes\":[\"AUTO-...\"],"
                + "\"tasks\":[{\"developmentTool\":\"...\",\"description\":\"...\",\"deadLine\":\"...Z\","
                + "\"comment\":\"\"}]}]}}";
    }

    /** dialog: без сообщения — старт диалога, иначе — ответ сотрудника. */
    @Transactional
    public TurnResult dialog(String sub, String messageOrNull) {
        DialogSession session = requireSession(sub);
        DialogTurn turn = (messageOrNull == null || messageOrNull.isBlank())
                ? orchestrator.start(session)
                : orchestrator.handle(session, messageOrNull);
        return materialize(turn, session);
    }

    /** Текущая стадия мастера — для первого STAGE_UPDATE диалога (до блокирующего LLM). */
    @Transactional(readOnly = true)
    public WorkflowStage activeStage(String sub) {
        return WorkflowStage.of(requireSession(sub));
    }

    /** История чата: без SYSTEM-сообщений, роль в нижнем регистре (как в mock /chat/messages). */
    @Transactional(readOnly = true)
    public List<V1ChatMessage> messages(String sub) {
        DialogSession session = requireSession(sub);
        List<V1ChatMessage> result = new ArrayList<>();
        for (DialogMessage message : messages.findBySessionIdOrderByIdAsc(session.getId())) {
            if (message.getRole() == MessageRole.SYSTEM) {
                continue;
            }
            result.add(new V1ChatMessage(
                    message.getId(),
                    message.getRole().name().toLowerCase(Locale.ROOT),
                    message.getContent(),
                    message.getCreatedAt()));
        }
        return result;
    }

    private TurnResult materialize(DialogTurn turn, DialogSession session) {
        V1Plan plan = withMainGoal(planMapper.toPlan(turn.idp()), session);
        return new TurnResult(UUID.randomUUID().toString(),
                turn.assistantMessage(),
                plan,
                WorkflowStage.of(turn.stage()));
    }

    /**
     * Оркестратор не заполняет верхнеуровневую цель плана — подставляем осмысленный
     * дефолт из названия целевой роли, если план непустой, а mainGoal пуст.
     */
    private V1Plan withMainGoal(V1Plan plan, DialogSession session) {
        if (plan == null || plan.directions() == null || plan.directions().isEmpty()) {
            return plan;
        }
        if (plan.mainGoal() != null && !plan.mainGoal().isBlank()) {
            return plan;
        }
        return new V1Plan(defaultMainGoal(session), plan.directions());
    }

    /** Дефолтная верхнеуровневая цель плана из названия целевой роли. */
    private String defaultMainGoal(DialogSession session) {
        String roleTitle = session.getTargetRoleId() == null ? null
                : positions.findById(session.getTargetRoleId()).map(JobPosition::getTitle).orElse(null);
        return roleTitle == null
                ? "Развитие ключевых компетенций для перехода на целевую роль."
                : "Развитие ключевых компетенций для перехода на роль «" + roleTitle + "».";
    }

    private DialogSession requireSession(String sub) {
        Employee employee = employees.findByExternalId(sub)
                .orElseThrow(() -> new DialogException("Сессия не найдена: пользователь не инициализирован"));
        return sessions.findFirstByEmployeeIdAndStatusOrderByIdDesc(employee.getId(), SessionStatus.ACTIVE)
                .orElseThrow(() -> new DialogException("Активная сессия не найдена. Сначала откройте контекст."));
    }

    private String buildRatingsMessage(Long targetRoleId, List<Rating> ratings, String plannedTasks) {
        Map<String, String> names = competencyNames(targetRoleId);

        StringBuilder sb = new StringBuilder();
        sb.append("Я прошёл самооценку по ключевым компетенциям целевой роли:\n");
        if (ratings != null) {
            for (Rating rating : ratings) {
                if (rating == null || rating.skillId() == null) {
                    continue;
                }
                String name = names.getOrDefault(rating.skillId(), rating.skillId());
                int value = rating.rating() == null ? 0 : rating.rating();
                sb.append("- «").append(name).append("»: ").append(value).append("/5\n");
            }
        }
        if (plannedTasks != null && !plannedTasks.isBlank()) {
            sb.append("\nРабочие задачи, которые я планирую выполнять для развития:\n")
                    .append(plannedTasks.trim()).append('\n');
        }
        sb.append("\nПожалуйста, сформируй черновик индивидуального плана развития (ИПР): ")
                .append("приоритеты с конкретными действиями, сделай упор на компетенции с низкой самооценкой")
                .append(plannedTasks != null && !plannedTasks.isBlank()
                        ? " и опирайся на указанные рабочие задачи в действиях «на рабочем месте»." : ".");
        return sb.toString();
    }

    /** code→name компетенций целевой роли. */
    private Map<String, String> competencyNames(Long targetRoleId) {
        Map<String, String> names = new LinkedHashMap<>();
        for (Competency competency : competencies.findByRoleIdOrderByCodeAsc(targetRoleId)) {
            names.put(competency.getCode(), competency.getName());
        }
        return names;
    }

    /** USER-промпт генерации черновика: профиль роли, самооценка, справочники категорий и инструментов. */
    private String buildDraftUserPrompt(JobPosition targetRole, Long roleId, List<Rating> ratings,
                                        String plannedTasks) {
        String roleTitle = targetRole.getTitle();
        java.time.LocalDate today = java.time.LocalDate.now();
        String todayStr = today.toString();
        String horizonStr = today.plusMonths(6).toString();
        String profile = targetRole.getJobDescriptionRef() == null || targetRole.getJobDescriptionRef().isBlank()
                ? "(профиль должности не задан)" : targetRole.getJobDescriptionRef();

        Map<String, String> names = competencyNames(roleId);
        StringBuilder ratingLines = new StringBuilder();
        if (ratings != null) {
            for (Rating rating : ratings) {
                if (rating == null || rating.skillId() == null) {
                    continue;
                }
                String name = names.getOrDefault(rating.skillId(), rating.skillId());
                int value = rating.rating() == null ? 0 : rating.rating();
                ratingLines.append("- ").append(name).append(": самооценка ").append(value).append("/5\n");
            }
        }
        if (ratingLines.length() == 0) {
            ratingLines.append("(самооценка не предоставлена)\n");
        }

        boolean hasTasks = plannedTasks != null && !plannedTasks.isBlank();
        String tasksBlock = hasTasks
                ? "\nСотрудник сам описал, какие рабочие задачи он планирует выполнять, чтобы развиваться "
                        + "(это его собственные приоритеты — опирайся на них в первую очередь при подборе "
                        + "действий формы «Развитие на рабочем месте» и привязывай развитие именно к этим "
                        + "задачам):\n" + plannedTasks.trim() + "\n"
                : "";

        StringBuilder categories = new StringBuilder();
        for (String category : goalCategories.all()) {
            categories.append("- ").append(category).append('\n');
        }

        StringBuilder tools = new StringBuilder();
        for (DevelopmentInstrument instrument : DevelopmentInstrument.values()) {
            tools.append("- ").append(instrument.getTitle()).append('\n');
        }

        StringBuilder competencies = new StringBuilder();
        for (Map.Entry<String, String> entry : names.entrySet()) {
            competencies.append("- ").append(entry.getKey()).append(" — ").append(entry.getValue()).append('\n');
        }
        if (competencies.length() == 0) {
            competencies.append("(компетенции роли не заданы)\n");
        }

        return "Сегодняшняя дата: " + todayStr + ". Все сроки должны быть ПОЗЖЕ этой даты и не дальше "
                + horizonStr + " (в пределах 6 месяцев).\n\n"
                + "Сотрудник развивается в сторону роли «" + roleTitle + "».\n\n"
                + "Профиль роли:\n" + profile + "\n\n"
                + "Самооценка сотрудника по компетенциям (1–5, чем ниже — тем слабее владение):\n"
                + ratingLines
                + tasksBlock
                + "\nДоступные КАТЕГОРИИ направления развития (поле \"goal\" — выбери для каждого направления "
                + "ОДНУ, наиболее подходящую ПО СМЫСЛУ, и СКОПИРУЙ её ДОСЛОВНО из этого списка, символ в символ, "
                + "без перефразирования; не ставь везде одну и ту же):\n"
                + categories
                + "\nДоступные ИНСТРУМЕНТЫ развития (поле \"developmentTool\" — выбери строго из этого списка):\n"
                + tools
                + "\nКОМПЕТЕНЦИИ целевой роли (код — название). Для КАЖДОГО направления в поле "
                + "\"competencyCodes\" укажи 1–2 кода ИЗ ЭТОГО СПИСКА, которые направление реально развивает "
                + "(строго коды, например \"AUTO-11-02\"). Если направление не ложится ни на одну компетенцию "
                + "роли — такое направление НЕ нужно, выбери другое:\n"
                + competencies
                + "\n" + DEV_MODEL_702010 + "\n"
                + "\nСоставь индивидуальный план развития на 3–6 месяцев. Требования:\n"
                + "- Распредели действия по модели 70/20/10: большинство — «на рабочем месте», часть — "
                + "«через других», немного — «учебные программы». В каждом направлении давай СМЕСЬ форм, "
                + "а не только курсы; содержание действия бери из приёмов выбранной формы.\n"
                + (hasTasks
                        ? "- ВАЖНО: сотрудник САМ описал задачи/проекты, через которые хочет расти. Определи, "
                        + "какую компетенцию роли они развивают, и построй вокруг них ОДНО отдельное направление "
                        + "(НЕ дроби эти задачи на несколько направлений) — даже если эта компетенция НЕ входит "
                        + "в самые слабые (это личная инициатива сотрудника). Действия «на рабочем месте» в этом "
                        + "направлении выведи ПРЯМО из описанных задач, не заменяй их абстрактными активностями. "
                        + "Неинформативные фразы (например «буду лучше всех») игнорируй — бери только конкретные "
                        + "профессиональные задачи.\n"
                        + "- Ещё 2–3 направления — по САМЫМ СЛАБЫМ компетенциям (низкая самооценка), каждое по "
                        + "РАЗНОЙ компетенции и НЕ по той, что уже в направлении по задачам. Всего НЕ МЕНЬШЕ 3 "
                        + "направлений, первым — направление по задачам сотрудника.\n"
                        : "- Возьми НЕ МЕНЬШЕ 3 САМЫХ СЛАБЫХ компетенций (низкая самооценка) — по одному "
                        + "направлению на каждую (в плане должно быть минимум 3 направления).\n")
                + "- КАЖДОЕ направление развивает СВОЮ, отдельную компетенцию: одна и та же компетенция (код) НЕ "
                + "должна появляться в двух направлениях. Приоритет — компетенциям с НИЗКОЙ самооценкой; НЕ бери "
                + "компетенции с высокой самооценкой (сильные стороны), пока есть неохваченные слабые.\n"
                + "- \"rank\": приоритет направления — 0 (высокий), 1 (средний), 2 (низкий); выше приоритет у "
                + "более слабых компетенций.\n"
                + (hasTasks ? "- Направлению по задачам сотрудника поставь rank 0 (высокий приоритет).\n" : "")
                + "- \"goal\": категория направления строго из списка категорий, подходящая по смыслу именно к "
                + "этой компетенции (НЕ ставь везде «Развитие личностных компетенций»).\n"
                + "- \"competencyCodes\": 1–2 кода компетенций роли из списка выше, которые это направление "
                + "развивает (ОБЯЗАТЕЛЬНО, строго коды из списка).\n"
                + "- \"description\": конкретная цель развития — что сотрудник НАУЧИТСЯ ДЕЛАТЬ и какой "
                + "наблюдаемый результат получит на рабочих задачах. НЕ пиши «увеличить уровень компетенции X "
                + "до N/5».\n"
                + "- \"tasks\": 2–3 конкретных развивающих действия. Для каждого: \"developmentTool\" строго из "
                + "списка инструментов; \"description\" — предметное действие (что именно сделать на практике, с "
                + "привязкой к рабочим задачам); \"deadLine\" — реалистичный БУДУЩИЙ срок (после " + todayStr
                + ", до " + horizonStr + ") в формате ISO-8601 UTC, например \"" + horizonStr
                + "T12:00:00Z\"; \"comment\": \"\".\n"
                + "- \"mainGoal\": одна фраза — общая цель плана (переход на роль «" + roleTitle + "»).\n\n"
                + "Верни СТРОГО JSON:\n"
                + "{\"mainGoal\":\"...\",\"directions\":[{\"rank\":0,\"goal\":\"...\",\"description\":\"...\","
                + "\"competencyCodes\":[\"AUTO-...\"],"
                + "\"tasks\":[{\"developmentTool\":\"...\",\"description\":\"...\","
                + "\"deadLine\":\"2026-09-30T12:00:00Z\",\"comment\":\"\"}]}]}";
    }

    /**
     * Разбирает JSON-ответ LLM в {@link V1Plan} и нормализует его: снимает ограждения кода,
     * берёт объект от первого '{' до последнего '}', клампит rank в 0..2, приводит инструмент
     * к справочному (иначе — «Развитие на рабочем месте»), подставляет mainGoal при пустом.
     *
     * @return нормализованный план или null, если разбор не удался или направлений нет
     */
    private V1Plan parseAndNormalize(String raw, DialogSession session) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        String json = raw.trim();
        if (json.startsWith("```")) {
            int firstBreak = json.indexOf('\n');
            if (firstBreak >= 0) {
                json = json.substring(firstBreak + 1);
            }
            int fence = json.lastIndexOf("```");
            if (fence >= 0) {
                json = json.substring(0, fence);
            }
        }
        int start = json.indexOf('{');
        int end = json.lastIndexOf('}');
        if (start < 0 || end <= start) {
            return null;
        }
        json = json.substring(start, end + 1);

        V1Plan parsed;
        try {
            parsed = objectMapper.readValue(json, V1Plan.class);
        } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
            log.warn("Не удалось разобрать JSON черновика ИПР от LLM: {}", e.getMessage());
            return null;
        }
        if (parsed == null || parsed.directions() == null || parsed.directions().isEmpty()) {
            return null;
        }

        List<V1Direction> directions = new ArrayList<>();
        for (V1Direction direction : parsed.directions()) {
            if (direction == null) {
                continue;
            }
            directions.add(new V1Direction(
                    clampRank(direction.rank()),
                    direction.goal(),
                    direction.description(),
                    sanitizeCompetencyCodes(direction.competencyCodes(), session.getTargetRoleId()),
                    normalizeTasks(direction.tasks())));
        }
        directions = mergeByCompetency(directions);
        if (directions.isEmpty()) {
            return null;
        }

        String mainGoal = parsed.mainGoal() == null || parsed.mainGoal().isBlank()
                ? defaultMainGoal(session) : parsed.mainGoal();
        return new V1Plan(mainGoal, directions);
    }

    /** rank строго в 0..2 (высокий/средний/низкий приоритет). */
    private static int clampRank(int rank) {
        return Math.max(0, Math.min(2, rank));
    }

    /**
     * Жёсткая гарантия «одна компетенция — одно направление»: если модель всё же выдала два
     * направления по одной (первой) компетенции, задачи второго дописываются в первое (до 5),
     * а дубль отбрасывается. Направления без кода не трогаются.
     */
    private static List<V1Direction> mergeByCompetency(List<V1Direction> directions) {
        List<V1Direction> result = new ArrayList<>();
        Map<String, Integer> indexByCode = new LinkedHashMap<>();
        for (V1Direction direction : directions) {
            List<String> codes = direction.competencyCodes();
            String primary = (codes == null || codes.isEmpty()) ? null : codes.get(0);
            if (primary != null && indexByCode.containsKey(primary)) {
                V1Direction existing = result.get(indexByCode.get(primary));
                List<V1Task> merged = new ArrayList<>(existing.tasks());
                List<V1Task> extra = direction.tasks() == null ? List.of() : direction.tasks();
                for (V1Task task : extra) {
                    if (merged.size() >= 5) {
                        break;
                    }
                    merged.add(task);
                }
                result.set(indexByCode.get(primary), new V1Direction(
                        existing.rank(), existing.goal(), existing.description(),
                        existing.competencyCodes(), merged));
                continue;
            }
            if (primary != null) {
                indexByCode.put(primary, result.size());
            }
            result.add(direction);
        }
        return result;
    }

    /**
     * Коды компетенций из ответа модели — оставляем только реально существующие у целевой
     * роли (трассируемость ИПР + защита от выдуманных направлений: то, что не ложится ни на
     * одну компетенцию роли, не получит кода).
     */
    private List<String> sanitizeCompetencyCodes(List<String> raw, Long roleId) {
        if (raw == null || raw.isEmpty() || roleId == null) {
            return List.of();
        }
        Set<String> known = competencyNames(roleId).keySet();
        List<String> result = new ArrayList<>();
        for (String code : raw) {
            if (code == null) {
                continue;
            }
            String trimmed = code.trim();
            if (known.contains(trimmed) && !result.contains(trimmed)) {
                result.add(trimmed);
            }
        }
        return result;
    }

    /** Инструмент каждой задачи — строго из справочника, иначе «Развитие на рабочем месте». */
    private static List<V1Task> normalizeTasks(List<V1Task> tasks) {
        List<V1Task> result = new ArrayList<>();
        if (tasks == null) {
            return result;
        }
        for (V1Task task : tasks) {
            if (task == null) {
                continue;
            }
            DevelopmentInstrument instrument = DevelopmentInstrument.byTitle(task.developmentTool());
            String tool = instrument == null
                    ? DevelopmentInstrument.WORKPLACE.getTitle() : instrument.getTitle();
            result.add(new V1Task(
                    tool,
                    task.comment() == null ? "" : task.comment(),
                    futureDeadLine(task.deadLine()),
                    task.description()));
        }
        return orderDeadlinesByInstrument(result);
    }

    /**
     * Приводит сроки внутри направления к логике 70/20/10: сначала ОБУЧЕНИЕ (теория),
     * затем РАБОТА на месте (практика), затем ФИДБЭК от коллег (оценка результата практики).
     * Модель расставляла даты вразнобой — фидбэк мог стоять раньше работы, по которой его
     * собирают. Берём те же сроки, что выдала модель, и перераспределяем их по возрастанию
     * между задачами в порядке приоритета инструмента, не трогая содержание задач.
     */
    private static List<V1Task> orderDeadlinesByInstrument(List<V1Task> tasks) {
        // Индексы задач с валидным (парсибельным) сроком.
        List<Integer> dated = new ArrayList<>();
        for (int i = 0; i < tasks.size(); i++) {
            String dl = tasks.get(i).deadLine();
            if (dl != null && !dl.isBlank()) {
                try {
                    java.time.OffsetDateTime.parse(dl);
                    dated.add(i);
                } catch (Exception ignored) {
                    // срок без даты не участвует в перестановке
                }
            }
        }
        if (dated.size() < 2) {
            return tasks;
        }
        // Сроки по возрастанию.
        List<String> sortedDeadlines = new ArrayList<>();
        for (int i : dated) {
            sortedDeadlines.add(tasks.get(i).deadLine());
        }
        sortedDeadlines.sort(java.util.Comparator.comparing(java.time.OffsetDateTime::parse));
        // Те же индексы — в порядке «обучение → работа → фидбэк» (стабильно внутри тира).
        List<Integer> byTier = new ArrayList<>(dated);
        byTier.sort(java.util.Comparator.comparingInt(i -> instrumentTier(tasks.get(i).developmentTool())));
        // Самый ранний срок — задаче с наивысшим приоритетом по тиру, и т.д.
        List<V1Task> result = new ArrayList<>(tasks);
        for (int k = 0; k < byTier.size(); k++) {
            int idx = byTier.get(k);
            V1Task t = tasks.get(idx);
            result.set(idx, new V1Task(t.developmentTool(), t.comment(), sortedDeadlines.get(k), t.description()));
        }
        return result;
    }

    /** Порядок срока по инструменту: обучение(0) → работа на месте(1) → фидбэк/прочее(2). */
    private static int instrumentTier(String tool) {
        DevelopmentInstrument instrument = DevelopmentInstrument.byTitle(tool);
        if (instrument == DevelopmentInstrument.LEARNING) {
            return 0;
        }
        if (instrument == DevelopmentInstrument.OTHERS) {
            return 2;
        }
        return 1; // WORKPLACE и всё прочее — практика посередине
    }

    /** Подстраховка: прошедший срок (модель могла не знать дату) сдвигаем на +3 месяца. */
    private static String futureDeadLine(String deadLine) {
        if (deadLine == null || deadLine.isBlank()) {
            return deadLine;
        }
        java.time.LocalDate today = java.time.LocalDate.now();
        try {
            java.time.LocalDate d = java.time.OffsetDateTime.parse(deadLine).toLocalDate();
            if (!d.isAfter(today)) {
                d = today.plusMonths(3);
                return d.atTime(12, 0).atOffset(java.time.ZoneOffset.UTC).toInstant().toString();
            }
            return deadLine;
        } catch (Exception e) {
            return today.plusMonths(3).atTime(12, 0).atOffset(java.time.ZoneOffset.UTC).toInstant().toString();
        }
    }

    /** Персист ассистентского сообщения — как делает оркестратор (meta=null). */
    private void save(Long sessionId, MessageRole role, String content) {
        DialogMessage message = new DialogMessage();
        message.setSessionId(sessionId);
        message.setRole(role);
        message.setContent(content);
        message.setMeta(null);
        messages.save(message);
    }
}
