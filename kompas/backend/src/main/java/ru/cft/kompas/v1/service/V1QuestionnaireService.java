package ru.cft.kompas.v1.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import ru.cft.kompas.config.KompasProperties;
import ru.cft.kompas.dialog.DialogException;
import ru.cft.kompas.domain.Competency;
import ru.cft.kompas.domain.DialogSession;
import ru.cft.kompas.domain.JobPosition;
import ru.cft.kompas.domain.SessionStatus;
import ru.cft.kompas.llm.ChatMessage;
import ru.cft.kompas.llm.LlmClient;
import ru.cft.kompas.llm.LlmParams;
import ru.cft.kompas.repo.CompetencyRepository;
import ru.cft.kompas.repo.EmployeeRepository;
import ru.cft.kompas.repo.JobPositionRepository;
import ru.cft.kompas.v1.repo.V1DialogSessionRepository;
import ru.cft.kompas.v1.sse.SkillItem;

/**
 * Опросник навыков целевой роли. Модель компетенций формируется LLM из профиля должности
 * (jobDescriptionRef) один раз на роль и кэшируется строками Competency: при повторных
 * обращениях читается из БД без обращения к LLM.
 *
 * skillId — код компетенции, rating=null (оценку выставит сотрудник).
 */
@Service
public class V1QuestionnaireService {

    private static final Logger log = LoggerFactory.getLogger(V1QuestionnaireService.class);

    /** Сколько попыток сформировать опросник у LLM, если ответ пуст/непарсибелен. */
    private static final int LLM_ATTEMPTS = 2;

    /** «грейд N из 4» в профиле должности → целевой уровень компетенции. */
    private static final Pattern GRADE = Pattern.compile("грейд[^0-9]{0,8}(\\d)");

    private static final int DEFAULT_TARGET_LEVEL = 3;

    private static final String SYSTEM_PROMPT =
            "Ты — методолог по управлению персоналом. По профилю должности формируешь список "
                    + "ОЦЕНИВАЕМЫХ компетенций для самооценки сотрудника, ПОЛНО покрывающий ключевые "
                    + "навыки и функции профиля — ничего значимого не пропускаешь.";

    private final EmployeeRepository employees;
    private final V1DialogSessionRepository sessions;
    private final JobPositionRepository positions;
    private final CompetencyRepository competencies;
    private final LlmClient llmClient;
    private final KompasProperties properties;
    private final ObjectMapper objectMapper;

    public V1QuestionnaireService(EmployeeRepository employees,
                                  V1DialogSessionRepository sessions,
                                  JobPositionRepository positions,
                                  CompetencyRepository competencies,
                                  LlmClient llmClient,
                                  KompasProperties properties,
                                  ObjectMapper objectMapper) {
        this.employees = employees;
        this.sessions = sessions;
        this.positions = positions;
        this.competencies = competencies;
        this.llmClient = llmClient;
        this.properties = properties;
        this.objectMapper = objectMapper;
    }

    /** Материализованный результат подготовки опросника (безопасно уходит из транзакции/потока). */
    public record Questionnaire(boolean ready, String targetRoleTitle, List<SkillItem> skills) {

        static Questionnaire missing() {
            return new Questionnaire(false, null, List.of());
        }
    }

    /** Промежуточная компетенция из ответа LLM до присвоения кода/уровня. */
    private record Generated(String name, String description) {
    }

    /**
     * Грузит активную сессию по sub и собирает опросник; ready=false, если нет целевой роли.
     * Не readOnly: при первом обращении к роли опросник генерируется LLM и персистится.
     */
    @Transactional
    public Questionnaire prepare(String sub) {
        DialogSession session = employees.findByExternalId(sub)
                .flatMap(e -> sessions.findFirstByEmployeeIdAndStatusOrderByIdDesc(e.getId(), SessionStatus.ACTIVE))
                .orElse(null);
        if (session == null || session.getTargetRoleId() == null) {
            return Questionnaire.missing();
        }
        String title = positions.findById(session.getTargetRoleId())
                .map(JobPosition::getTitle).orElse(null);
        if (title == null) {
            return Questionnaire.missing();
        }
        return new Questionnaire(true, title, forTargetRole(session));
    }

    /**
     * Навыки опросника целевой роли. Кэш-попадание — чтение существующих Competency из БД.
     * Первый запрос по роли: генерация LLM из профиля должности + персист строк Competency.
     */
    @Transactional
    public List<SkillItem> forTargetRole(DialogSession session) {
        Long roleId = session.getTargetRoleId();
        if (roleId == null) {
            return List.of();
        }

        List<Competency> existing = competencies.findByRoleIdOrderByCodeAsc(roleId);
        if (!existing.isEmpty()) {
            return toSkills(existing);
        }

        JobPosition role = positions.findById(roleId).orElse(null);
        if (role == null) {
            return List.of();
        }

        List<Generated> generated = generate(role);
        if (generated.isEmpty()) {
            throw new DialogException("Не удалось сформировать опросник по профилю роли");
        }

        int targetLevel = parseTargetLevel(role.getJobDescriptionRef());
        int index = 1;
        for (Generated g : generated) {
            Competency competency = new Competency();
            competency.setCode(String.format("AUTO-%d-%02d", roleId, index++));
            competency.setRoleId(roleId);
            competency.setName(g.name());
            competency.setDescription(g.description());
            competency.setTargetLevel(targetLevel);
            competencies.save(competency);
        }

        return toSkills(competencies.findByRoleIdOrderByCodeAsc(roleId));
    }

    private static List<SkillItem> toSkills(List<Competency> source) {
        List<SkillItem> skills = new ArrayList<>();
        for (Competency competency : source) {
            skills.add(new SkillItem(
                    competency.getCode(),
                    competency.getName(),
                    competency.getDescription() == null ? "" : competency.getDescription(),
                    null));
        }
        return skills;
    }

    /** Формирует 8–12 компетенций по профилю роли (полное покрытие). mock → детерминированный фолбэк. */
    private List<Generated> generate(JobPosition role) {
        if ("mock".equals(llmClient.provider())) {
            return fallback(role);
        }

        List<ChatMessage> messages = List.of(
                ChatMessage.system(SYSTEM_PROMPT),
                ChatMessage.user(userPrompt(role)));
        LlmParams params = LlmParams.of(properties.getLlm().getTemperature(),
                properties.getLlm().getMaxTokens());

        for (int attempt = 1; attempt <= LLM_ATTEMPTS; attempt++) {
            try {
                List<Generated> parsed = parse(llmClient.chat(messages, params));
                if (!parsed.isEmpty()) {
                    return parsed;
                }
                log.warn("LLM вернул пустой/непарсибельный список компетенций (попытка {} из {})",
                        attempt, LLM_ATTEMPTS);
            } catch (RuntimeException e) {
                if (attempt == LLM_ATTEMPTS) {
                    throw new DialogException("Не удалось сформировать опросник по профилю роли", e);
                }
                log.warn("Сбой генерации опросника (попытка {} из {}): {}",
                        attempt, LLM_ATTEMPTS, e.getMessage());
            }
        }
        return List.of();
    }

    private static String userPrompt(JobPosition role) {
        String profile = role.getJobDescriptionRef() == null ? "" : role.getJobDescriptionRef();
        return "Целевая роль: " + role.getTitle() + "\n\n"
                + "Профиль должности:\n" + profile + "\n\n"
                + "Сформируй 8–12 ключевых компетенций (умение/способность, не факт-знание) "
                + "именно для этой роли и её грейда.\n"
                + "ПОКРОЙ ВЕСЬ профиль: пройдись по разделам «Ключевые функции», «Требуемые знания» и "
                + "«Специальные навыки» и отрази КАЖДУЮ значимую группу навыков отдельной компетенцией. "
                + "НЕ объединяй разные навыки в один и НЕ пропускай значимые — например, если в профиле "
                + "есть макетирование/проектирование интерфейсов, анализ бизнес-процессов, разработка "
                + "документации, управление требованиями или наставничество, каждое должно стать "
                + "отдельной компетенцией.\n"
                + "Для каждой: 'name' (2–6 слов, без слова «Знание…») и 'description' (1 предложение — "
                + "что значит владеть на уровне этой роли). Компетенции должны отражать масштаб и "
                + "самостоятельность именно этого грейда. Верни строго JSON: "
                + "{\"competencies\":[{\"name\":\"...\",\"description\":\"...\"}]}";
    }

    /** Разбирает JSON-ответ LLM: снимает ограждения кода, берёт объект от первого '{'. */
    private List<Generated> parse(String raw) {
        if (raw == null || raw.isBlank()) {
            return List.of();
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
            return List.of();
        }
        json = json.substring(start, end + 1);

        List<Generated> result = new ArrayList<>();
        try {
            JsonNode root = objectMapper.readTree(json);
            JsonNode items = root.path("competencies");
            if (!items.isArray()) {
                return List.of();
            }
            for (JsonNode item : items) {
                String name = item.path("name").asText("").trim();
                if (name.isEmpty()) {
                    continue;
                }
                String description = item.path("description").asText("").trim();
                result.add(new Generated(name, description));
                if (result.size() == 12) {
                    break;
                }
            }
        } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
            log.warn("Не удалось разобрать JSON опросника от LLM: {}", e.getMessage());
            return List.of();
        }
        return result;
    }

    /** «грейд N из 4» → N, иначе дефолтный уровень. */
    private static int parseTargetLevel(String profile) {
        if (profile != null) {
            Matcher matcher = GRADE.matcher(profile);
            if (matcher.find()) {
                try {
                    return Integer.parseInt(matcher.group(1));
                } catch (NumberFormatException ignore) {
                    // ниже вернётся дефолт
                }
            }
        }
        return DEFAULT_TARGET_LEVEL;
    }

    /**
     * Детерминированный фолбэк для офлайн/mock-провайдера: MockLlmClient отдаёт
     * диалоговые конверты, а не список компетенций, поэтому опросник собираем сами.
     */
    private static List<Generated> fallback(JobPosition role) {
        String title = role.getTitle() == null ? "целевой роли" : role.getTitle();
        return List.of(
                new Generated("Профессиональная экспертиза",
                        "Самостоятельно решает профильные задачи роли «" + title + "» на требуемом уровне."),
                new Generated("Планирование и организация работы",
                        "Планирует работу, расставляет приоритеты и укладывается в сроки без постоянного контроля."),
                new Generated("Решение проблем",
                        "Анализирует нестандартные ситуации и предлагает обоснованные решения."),
                new Generated("Коммуникация и взаимодействие",
                        "Чётко доносит позицию и продуктивно взаимодействует с коллегами и смежными командами."),
                new Generated("Ответственность за результат",
                        "Доводит задачи до результата и отвечает за качество в зоне роли «" + title + "»."),
                new Generated("Развитие и наставничество",
                        "Развивает собственные навыки и делится экспертизой с командой."));
    }
}
