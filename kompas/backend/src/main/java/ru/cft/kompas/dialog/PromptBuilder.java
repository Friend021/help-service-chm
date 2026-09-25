package ru.cft.kompas.dialog;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;
import ru.cft.kompas.domain.DialogStage;
import ru.cft.kompas.llm.ChatMessage;
import ru.cft.kompas.rag.RagContext;

/**
 * Собирает промпт: системный шаблон стадии + состояние сессии + RAG-контекст + история.
 * Шаблоны лежат в /resources/prompts и версионируются отдельно от кода.
 */
@Component
public class PromptBuilder {

    /** Сколько последних реплик передаём в модель. */
    private static final int HISTORY_LIMIT = 12;

    private final ObjectMapper objectMapper;
    private final Map<String, String> cache = new ConcurrentHashMap<>();

    public PromptBuilder(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    /** С какого хода на одной стадии считаем, что диалог буксует. */
    public static final int STALL_AFTER_TURNS = 2;

    public List<ChatMessage> build(DialogStage stage,
                                   SessionState state,
                                   RagContext ragContext,
                                   List<ChatMessage> history,
                                   String userMessage,
                                   boolean stalled) {
        List<ChatMessage> messages = new ArrayList<>();
        messages.add(ChatMessage.system(template("system-base.md") + "\n\n" + template(stageTemplate(stage))));

        int from = Math.max(0, history.size() - HISTORY_LIMIT);
        messages.addAll(history.subList(from, history.size()));

        StringBuilder user = new StringBuilder();
        user.append("### Состояние сессии\n").append(stateJson(stage, state)).append("\n\n");

        if (ragContext != null && !ragContext.text().isBlank()) {
            user.append("### КОНТЕКСТ СПРАВОЧНИКОВ\n").append(ragContext.text()).append('\n');
        } else {
            user.append("### КОНТЕКСТ СПРАВОЧНИКОВ\n")
                    .append("(пусто — данных по целевой роли в справочниках нет)\n\n");
        }

        if (stalled) {
            user.append("""
                    ### Диалог буксует
                    Сессия уже несколько ходов стоит на этой стадии. Перечитай, что сотрудник
                    написал выше: скорее всего ответ уже дан, а вопрос задаётся повторно.
                    Повторять его нельзя. Если данных хватает — переходи на следующую стадию,
                    назвав принятые допущения одной фразой. Если чего-то действительно
                    не хватает — скажи прямо, чего именно, и спроси только это.

                    """);
        }

        user.append("### Сообщение сотрудника\n")
                .append(userMessage == null || userMessage.isBlank() ? "(начало диалога)" : userMessage);

        messages.add(ChatMessage.user(user.toString()));
        return messages;
    }

    /** Корректирующий запрос, если модель нарушила формат ответа. */
    public List<ChatMessage> buildRetry(List<ChatMessage> original, String badAnswer) {
        List<ChatMessage> messages = new ArrayList<>(original);
        messages.add(ChatMessage.assistant(badAnswer));
        messages.add(ChatMessage.user("""
                Формат ответа нарушен. Верни СТРОГО один JSON-объект с полями
                message, nextStage, draft — без markdown и без текста вокруг."""));
        return messages;
    }

    private String stateJson(DialogStage stage, SessionState state) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("stage", stage.name());
        // Без явной даты модель ставит в SMART-целях сроки из своего обучающего периода.
        payload.put("today", LocalDate.now().toString());
        payload.put("employee", state.employeeName());
        payload.put("currentPosition", state.currentPosition());
        payload.put("targetRole", state.targetRole());
        payload.put("currentDraft", state.draft());
        try {
            return objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(payload);
        } catch (Exception e) {
            return "{\"stage\":\"" + stage.name() + "\"}";
        }
    }

    private static String stageTemplate(DialogStage stage) {
        return switch (stage) {
            case CONTEXT -> "stage-context.md";
            case GAP_ANALYSIS -> "stage-gap-analysis.md";
            case INTERESTS -> "stage-interests.md";
            case DRAFT -> "stage-draft.md";
            case REFINE -> "stage-refine.md";
            case FINALIZE -> "stage-finalize.md";
        };
    }

    private String template(String name) {
        return cache.computeIfAbsent(name, key -> {
            try (InputStream stream = new ClassPathResource("prompts/" + key).getInputStream()) {
                return new String(stream.readAllBytes(), StandardCharsets.UTF_8);
            } catch (Exception e) {
                throw new IllegalStateException("Не найден шаблон промпта prompts/" + key, e);
            }
        });
    }

    /** Состояние сессии, подаваемое в промпт. */
    public record SessionState(String employeeName,
                               String currentPosition,
                               String targetRole,
                               DraftDto draft) {
    }
}
