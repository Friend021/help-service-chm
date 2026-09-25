package ru.cft.kompas.llm;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Детерминированная заглушка LLM для офлайн-профиля и тестов.
 * Читает стадию и RAG-контекст из последнего сообщения пользователя и отдаёт
 * правдоподобный ответ строго в том же JSON-формате, что и боевой провайдер.
 */
public class MockLlmClient implements LlmClient {

    private static final Logger log = LoggerFactory.getLogger(MockLlmClient.class);

    private static final Pattern STAGE = Pattern.compile("\"stage\"\\s*:\\s*\"([A-Z_]+)\"");
    private static final Pattern TARGET_ROLE = Pattern.compile("\"targetRole\"\\s*:\\s*\"([^\"]*)\"");
    private static final Pattern COMPETENCY = Pattern.compile("\\[COMP:([^\\]]+)\\]\\s*([^\\n(]+)");
    private static final Pattern ACTIVITY = Pattern.compile("\\[ACT:([^\\]]+)\\]\\s*([^\\n(]+)");

    @Override
    public String chat(List<ChatMessage> messages, LlmParams params) {
        String prompt = messages.stream()
                .filter(m -> "user".equals(m.role()))
                .reduce((first, second) -> second)
                .map(ChatMessage::content)
                .orElse("");

        String stage = firstGroup(STAGE, prompt, "CONTEXT");
        String targetRole = firstGroup(TARGET_ROLE, prompt, "целевая роль");
        Map<String, String> competencies = extract(COMPETENCY, prompt);
        Map<String, String> activities = extract(ACTIVITY, prompt);

        log.debug("MockLlmClient: стадия {}, компетенций {}, активностей {}",
                stage, competencies.size(), activities.size());

        return switch (stage) {
            case "CONTEXT" -> context(prompt, targetRole);
            case "GAP_ANALYSIS" -> gapAnalysis(competencies);
            case "INTERESTS" -> interests();
            case "DRAFT" -> draft(prompt, targetRole, competencies, activities);
            case "REFINE" -> refine();
            default -> finalizeStage(targetRole);
        };
    }

    @Override
    public String provider() {
        return "mock";
    }

    private String context(String prompt, String targetRole) {
        // Отказ не считаем подтверждением: остаёмся на стадии и предлагаем выбор.
        if (declined(userMessage(prompt))) {
            List<String> roles = availableRoles(prompt);
            String options = roles.isEmpty()
                    ? "Назовите роль, к которой хотите двигаться."
                    : "Вот роли вашего трека: " + String.join(", ", roles)
                            + ". Какая из них ближе как ориентир?";
            return envelope("""
                    Понял, переход не в ближайших планах. План развития всё равно \
                    строится от ориентира — целевой роли, даже если двигаться к ней \
                    не завтра. %s""".formatted(options), "CONTEXT", null);
        }

        return envelope("""
                Здравствуйте! Я помогу собрать индивидуальный план развития.
                Вижу целевую роль: %s. Подтвердите, что она актуальна, \
                или назовите другую — и перейдём к оценке компетенций."""
                .formatted(targetRole), "GAP_ANALYSIS", null);
    }

    private String gapAnalysis(Map<String, String> competencies) {
        StringBuilder text = new StringBuilder(
                "Разберём разрыв с целевой ролью. Ключевые компетенции из модели компетенций:\n");
        competencies.forEach((code, name) -> text.append("- ").append(name.trim()).append("\n"));
        text.append("\nОцените каждую по шкале 1-4 и отметьте, где разрыв ощущается сильнее всего.");
        return envelope(text.toString(), "INTERESTS", null);
    }

    private String interests() {
        return envelope("""
                Спасибо. Теперь про формат: что вам ближе — курсы и теория, \
                практика на реальных задачах, менторство или выступления и сообщества? \
                И сколько часов в неделю вы готовы выделять на развитие?""",
                "DRAFT", null);
    }

    private String draft(String prompt, String targetRole,
                         Map<String, String> competencies, Map<String, String> activities) {
        List<String> competencyCodes = new ArrayList<>(competencies.keySet());
        List<String> activityCodes = new ArrayList<>(activities.keySet());

        if (competencyCodes.isEmpty()) {
            return envelope("""
                    В справочниках не нашлось компетенций целевой роли, \
                    поэтому черновик собрать не могу. Уточните целевую роль.""",
                    "CONTEXT", null);
        }

        int count = Math.min(3, competencyCodes.size());
        StringBuilder draft = new StringBuilder("{\"targetRole\":\"")
                .append(escape(targetRole))
                .append("\",\"priorities\":[");

        LocalDate base = LocalDate.now();
        for (int i = 0; i < count; i++) {
            String code = competencyCodes.get(i);
            String name = competencies.get(code).trim();
            String activity = pickActivity(prompt, code, activityCodes, i);

            if (i > 0) {
                draft.append(',');
            }
            draft.append("{\"order\":").append(i + 1)
                    .append(",\"developmentGoal\":\"")
                    .append(escape("До %s выйти на целевой уровень по направлению \"%s\": закрыть не менее двух рабочих задач, где эта компетенция применяется, и получить обратную связь руководителя."
                            .formatted(base.plusMonths(3L * (i + 1)).format(java.time.format.DateTimeFormatter.ofPattern("dd.MM.yyyy")), name)))
                    .append("\",\"competencyCodes\":[\"").append(escape(code)).append("\"]")
                    .append(",\"activityCodes\":")
                    .append(activity == null ? "[]" : "[\"" + escape(activity) + "\"]")
                    .append(",\"milestones\":[{\"title\":\"")
                    .append(escape("Промежуточная проверка: " + name))
                    .append("\",\"dueDate\":\"")
                    .append(base.plusMonths(3L * (i + 1)).minusMonths(1))
                    .append("\"}]}");
        }
        draft.append("]}");

        return envelope("""
                Собрал черновик ИПР на основе компетенций целевой роли и каталога \
                развивающих активностей. Посмотрите приоритеты справа: что скорректировать?""",
                "REFINE", draft.toString());
    }

    private String refine() {
        return envelope("""
                Принял правку. Черновик обновлён в панели справа. \
                Если всё верно — скажите «готово», и зафиксируем план.""",
                "FINALIZE", null);
    }

    private String finalizeStage(String targetRole) {
        return envelope("""
                План по роли %s зафиксирован. Можно выгрузить его в DOCX или JSON \
                и отправить руководителю на согласование."""
                .formatted(targetRole), "FINALIZE", null);
    }

    /**
     * Подбирает активность, которая по каталогу развивает нужную компетенцию
     * (строка контекста содержит «развивает: КОД КОД»). Если связи нет — берёт по кругу.
     */
    private static String pickActivity(String prompt, String competencyCode,
                                       List<String> activityCodes, int index) {
        if (activityCodes.isEmpty()) {
            return null;
        }
        for (String line : prompt.split("\n")) {
            if (!line.contains("[ACT:") || !line.contains("развивает:")) {
                continue;
            }
            String tail = line.substring(line.indexOf("развивает:"));
            if (!tail.contains(competencyCode)) {
                continue;
            }
            int start = line.indexOf("[ACT:") + 5;
            int end = line.indexOf(']', start);
            if (end > start) {
                String code = line.substring(start, end).trim();
                if (activityCodes.contains(code)) {
                    return code;
                }
            }
        }
        return activityCodes.get(index % activityCodes.size());
    }

    /** Текст последней реплики сотрудника из собранного промпта. */
    private static String userMessage(String prompt) {
        int marker = prompt.lastIndexOf("### Сообщение сотрудника");
        if (marker < 0) {
            return "";
        }
        int start = prompt.indexOf('\n', marker);
        return start < 0 ? "" : prompt.substring(start + 1).trim();
    }

    private static boolean declined(String message) {
        String text = message.toLowerCase(java.util.Locale.ROOT).replace('ё', 'е');
        if (text.isEmpty() || text.startsWith("(начало диалога)")) {
            return false;
        }
        return text.startsWith("нет")
                || text.contains("не согласен")
                || text.contains("не согласна")
                || text.contains("остаюсь")
                || text.contains("остаться")
                || text.contains("не хочу")
                || text.contains("не планирую");
    }

    /** Роли из блока «Доступные целевые роли трека» RAG-контекста. */
    private static List<String> availableRoles(String prompt) {
        List<String> roles = new ArrayList<>();
        boolean inside = false;
        for (String line : prompt.split("\n")) {
            if (line.startsWith("### Доступные целевые роли")) {
                inside = true;
                continue;
            }
            if (inside) {
                if (line.startsWith("###")) {
                    break;
                }
                if (line.startsWith("- ")) {
                    roles.add(line.substring(2).replace("(выбрана сейчас)", "").trim());
                }
            }
        }
        return roles;
    }

    private String envelope(String message, String nextStage, String draftJson) {
        return "{\"message\":\"" + escape(message) + "\","
                + "\"nextStage\":\"" + nextStage + "\","
                + "\"draft\":" + (draftJson == null ? "null" : draftJson) + "}";
    }

    private static String escape(String value) {
        return value.replace("\\", "\\\\")
                .replace("\"", "\\\"")
                .replace("\n", "\\n")
                .replace("\r", "");
    }

    private static String firstGroup(Pattern pattern, String text, String fallback) {
        Matcher matcher = pattern.matcher(text);
        if (matcher.find() && !matcher.group(1).isBlank()) {
            return matcher.group(1);
        }
        return fallback;
    }

    private static Map<String, String> extract(Pattern pattern, String text) {
        Map<String, String> result = new LinkedHashMap<>();
        Matcher matcher = pattern.matcher(text);
        while (matcher.find()) {
            result.putIfAbsent(matcher.group(1).trim(), matcher.group(2).trim());
        }
        return result;
    }
}
