package ru.cft.kompas.dialog;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import ru.cft.kompas.domain.DevelopmentInstrument;
import ru.cft.kompas.domain.DialogStage;
import ru.cft.kompas.reference.GoalCategoryCatalog;

/**
 * Разбирает ответ LLM: достаёт JSON-объект из произвольного текста,
 * валидирует его и отсекает коды, которых не было в RAG-контексте.
 */
@Component
public class DraftParser {

    private static final Logger log = LoggerFactory.getLogger(DraftParser.class);

    private final ObjectMapper objectMapper;
    private final GoalCategoryCatalog goalCategories;

    public DraftParser(ObjectMapper objectMapper, GoalCategoryCatalog goalCategories) {
        this.objectMapper = objectMapper;
        this.goalCategories = goalCategories;
    }

    public AssistantEnvelope parse(String raw, DialogStage currentStage) {
        String json = extractJson(raw);
        AssistantEnvelope envelope;
        try {
            envelope = objectMapper.readValue(json, AssistantEnvelope.class);
        } catch (Exception e) {
            throw new DraftParseException("Ответ LLM не разбирается как JSON", e);
        }

        if (envelope.message() == null || envelope.message().isBlank()) {
            throw new DraftParseException("В ответе LLM отсутствует поле message");
        }

        String nextStage = normalizeStage(envelope.nextStage(), currentStage);
        String targetRole = envelope.targetRole() == null || envelope.targetRole().isBlank()
                ? null
                : envelope.targetRole().trim();
        return new AssistantEnvelope(envelope.message().trim(), nextStage, targetRole, envelope.draft());
    }

    /**
     * Оставляет в черновике только коды, реально присутствовавшие в контексте.
     * Так выполняется требование ТЗ: план опирается на реальные справочники.
     */
    public DraftDto sanitize(DraftDto draft, Collection<String> allowedCompetencies,
                             Collection<String> allowedActivities) {
        if (draft == null) {
            return null;
        }

        Set<String> competencies = Set.copyOf(allowedCompetencies);
        Set<String> activities = Set.copyOf(allowedActivities);
        List<DraftDto.PriorityDto> result = new ArrayList<>();

        List<DraftDto.PriorityDto> source = draft.priorities() == null ? List.of() : draft.priorities();
        int order = 1;
        for (DraftDto.PriorityDto priority : source) {
            if (priority.developmentGoal() == null || priority.developmentGoal().isBlank()) {
                continue;
            }
            List<String> keptCompetencies = keep(priority.competencyCodes(), competencies, "компетенции");

            // Категория должна быть из справочника формы, иначе перенос туда не встанет
            String category = goalCategories.normalize(priority.goalCategory());
            if (category == null && priority.goalCategory() != null) {
                log.warn("Ассистент вернул категорию цели «{}» вне справочника — отброшена",
                        priority.goalCategory());
            }

            result.add(new DraftDto.PriorityDto(order++, category, priority.developmentGoal().trim(),
                    keptCompetencies, sanitizeActions(priority.actions(), activities)));
        }

        return new DraftDto(draft.targetRole(), result);
    }

    /**
     * Развивающие действия приоритета.
     *
     * Инструмент обязан быть из справочника формы, иначе строка не встанет
     * в её выпадающий список. Код активности — из RAG-контекста этого хода;
     * чужой отбрасывается, но само действие остаётся: сотрудник вправе
     * делать что-то своими словами, а не только по каталогу.
     */
    private List<DraftDto.ActionDto> sanitizeActions(List<DraftDto.ActionDto> actions,
                                                     Set<String> allowedActivities) {
        if (actions == null) {
            return List.of();
        }

        List<DraftDto.ActionDto> kept = new ArrayList<>();
        for (DraftDto.ActionDto action : actions) {
            if (action.action() == null || action.action().isBlank()) {
                continue;
            }

            DevelopmentInstrument instrument = DevelopmentInstrument.byTitle(action.instrument());
            if (instrument == null) {
                log.warn("Ассистент вернул инструмент развития «{}» вне справочника — ставлю «{}»",
                        action.instrument(), DevelopmentInstrument.WORKPLACE.getTitle());
                instrument = DevelopmentInstrument.WORKPLACE;
            }

            String code = normalizeCode(action.activityCode());
            if (!code.isEmpty() && !allowedActivities.contains(code)) {
                log.warn("Ассистент сослался на активность {} вне контекста — ссылка убрана", code);
                code = "";
            }

            kept.add(new DraftDto.ActionDto(instrument.getTitle(),
                    code.isEmpty() ? null : code,
                    action.action().trim(),
                    action.dueDate()));
        }
        return kept;
    }

    private List<String> keep(List<String> codes, Set<String> allowed, String what) {
        if (codes == null) {
            return List.of();
        }
        List<String> kept = new ArrayList<>();
        for (String code : codes) {
            String normalized = normalizeCode(code);
            if (allowed.contains(normalized)) {
                kept.add(normalized);
            } else if (!normalized.isEmpty()) {
                log.warn("Ассистент вернул код {} вне контекста ({}) — отброшен", normalized, what);
            }
        }
        return kept;
    }

    /**
     * В контексте коды показаны как [COMP:LJD-01] / [ACT:ACT-001], и модель часто
     * копирует их вместе с префиксом и скобками. Это тот же реальный код справочника,
     * поэтому приводим к каноническому виду, а не отбрасываем.
     */
    static String normalizeCode(String code) {
        String value = code == null ? "" : code.trim();
        if (value.startsWith("[") && value.endsWith("]")) {
            value = value.substring(1, value.length() - 1).trim();
        }
        int colon = value.indexOf(':');
        if (colon > 0) {
            String prefix = value.substring(0, colon).trim().toUpperCase();
            if ("COMP".equals(prefix) || "ACT".equals(prefix) || "COMPETENCY".equals(prefix)) {
                value = value.substring(colon + 1).trim();
            }
        }
        return value;
    }

    private String normalizeStage(String value, DialogStage currentStage) {
        if (value == null) {
            return currentStage.name();
        }
        try {
            return DialogStage.valueOf(value.trim().toUpperCase()).name();
        } catch (IllegalArgumentException e) {
            log.warn("Неизвестная стадия {} в ответе LLM — остаёмся на {}", value, currentStage);
            return currentStage.name();
        }
    }

    /** Достаёт первый сбалансированный JSON-объект, игнорируя markdown-обёртку. */
    static String extractJson(String raw) {
        if (raw == null || raw.isBlank()) {
            throw new DraftParseException("Пустой ответ LLM");
        }

        String text = raw.trim();
        int start = text.indexOf('{');
        if (start < 0) {
            throw new DraftParseException("В ответе LLM нет JSON-объекта");
        }

        boolean inString = false;
        boolean escaped = false;
        int depth = 0;
        for (int i = start; i < text.length(); i++) {
            char c = text.charAt(i);
            if (escaped) {
                escaped = false;
                continue;
            }
            if (c == '\\') {
                escaped = true;
                continue;
            }
            if (c == '"') {
                inString = !inString;
                continue;
            }
            if (inString) {
                continue;
            }
            if (c == '{') {
                depth++;
            } else if (c == '}') {
                depth--;
                if (depth == 0) {
                    return text.substring(start, i + 1);
                }
            }
        }
        throw new DraftParseException("JSON-объект в ответе LLM не закрыт");
    }
}
