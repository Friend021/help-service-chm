package ru.cft.kompas.dialog;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import org.junit.jupiter.api.Test;
import ru.cft.kompas.domain.DialogStage;
import ru.cft.kompas.llm.ChatMessage;
import ru.cft.kompas.rag.RagContext;

class PromptBuilderTest {

    private final PromptBuilder builder = new PromptBuilder(new ObjectMapper());

    private static final PromptBuilder.SessionState STATE = new PromptBuilder.SessionState(
            "Соколова Анна Дмитриевна", "Разработчик Java", "Ведущий разработчик Java", null);

    private static final RagContext CONTEXT = new RagContext(
            "### Компетенции целевой роли\n- [COMP:LJD-01] Проектирование компонентов и API\n",
            List.of("LJD-01"), List.of(), List.of("COMP:LJD-01"));

    @Test
    void промпт_содержит_стадию_контекст_и_реплику() {
        String user = userMessage(build(DialogStage.GAP_ANALYSIS, "Проектирование на 2", false));

        assertThat(user).contains("### Состояние сессии");
        assertThat(user).contains("\"stage\" : \"GAP_ANALYSIS\"");
        assertThat(user).contains("### КОНТЕКСТ СПРАВОЧНИКОВ");
        assertThat(user).contains("[COMP:LJD-01]");
        assertThat(user).contains("Проектирование на 2");
    }

    @Test
    void сегодняшняя_дата_передаётся_модели() {
        // Без неё модель ставит в SMART-целях сроки из своего обучающего периода
        assertThat(userMessage(build(DialogStage.DRAFT, "давай", false)))
                .contains("\"today\"");
    }

    @Test
    void системное_сообщение_склеено_из_базового_и_стадийного_шаблонов() {
        List<ChatMessage> prompt = build(DialogStage.REFINE, "убери третий", false);

        assertThat(prompt.get(0).role()).isEqualTo("system");
        assertThat(prompt.get(0).content()).contains("Ты — «Компас»");
        assertThat(prompt.get(0).content()).contains("REFINE — доработка");
    }

    @Test
    void при_буксовании_добавляется_подсказка_сдвинуться() {
        String user = userMessage(build(DialogStage.INTERESTS, "практика, 5 часов", true));

        assertThat(user).contains("### Диалог буксует");
        assertThat(user).contains("Повторять его нельзя");
    }

    @Test
    void без_буксования_подсказки_нет() {
        assertThat(userMessage(build(DialogStage.INTERESTS, "практика, 5 часов", false)))
                .doesNotContain("Диалог буксует");
    }

    @Test
    void пустой_rag_контекст_помечается_явно() {
        RagContext empty = new RagContext("", List.of(), List.of(), List.of());
        List<ChatMessage> prompt = builder.build(
                DialogStage.CONTEXT, STATE, empty, List.of(), "привет", false);

        assertThat(userMessage(prompt)).contains("(пусто");
    }

    private List<ChatMessage> build(DialogStage stage, String message, boolean stalled) {
        return builder.build(stage, STATE, CONTEXT, List.of(), message, stalled);
    }

    private static String userMessage(List<ChatMessage> prompt) {
        return prompt.get(prompt.size() - 1).content();
    }
}
