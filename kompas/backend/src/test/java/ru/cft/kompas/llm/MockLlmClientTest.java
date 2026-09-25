package ru.cft.kompas.llm;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import org.junit.jupiter.api.Test;
import ru.cft.kompas.dialog.AssistantEnvelope;
import ru.cft.kompas.dialog.DraftParser;
import ru.cft.kompas.domain.DialogStage;
import ru.cft.kompas.reference.GoalCategoryCatalog;

class MockLlmClientTest {

    private final MockLlmClient client = new MockLlmClient();
    private final DraftParser parser = new DraftParser(new ObjectMapper(), new GoalCategoryCatalog());

    private static final String CONTEXT = """
            ### Состояние сессии
            {"stage":"%s","targetRole":"Ведущий разработчик Java"}

            ### КОНТЕКСТ СПРАВОЧНИКОВ
            ### Компетенции целевой роли (модель компетенций)
            - [COMP:LJD-01] Проектирование компонентов и API (целевой уровень 3). Описание.
            - [COMP:LJD-02] Java-платформа и производительность (целевой уровень 3). Описание.
            ### Каталог развивающих активностей
            - [ACT:ACT-001] Внутренний курс (инструмент: Развитие через учебные программы, источник: Учебный центр, развивает: LJD-01). Описание.
            - [ACT:ACT-004] Воркшоп по JVM (инструмент: Развитие через учебные программы, источник: Учебный центр, развивает: LJD-02). Описание.

            ### Сообщение сотрудника
            Да, всё верно.
            """;

    @Test
    void каждая_стадия_даёт_разбираемый_ответ() {
        for (DialogStage stage : DialogStage.values()) {
            String raw = client.chat(
                    List.of(ChatMessage.user(CONTEXT.formatted(stage.name()))),
                    LlmParams.of(0.3, 1000));

            AssistantEnvelope envelope = parser.parse(raw, stage);

            assertThat(envelope.message()).as("сообщение на стадии %s", stage).isNotBlank();
            assertThat(envelope.nextStage()).as("стадия после %s", stage).isNotBlank();
        }
    }

    @Test
    void на_стадии_draft_черновик_опирается_на_коды_из_контекста() {
        String raw = client.chat(
                List.of(ChatMessage.user(CONTEXT.formatted("DRAFT"))),
                LlmParams.of(0.3, 1000));

        AssistantEnvelope envelope = parser.parse(raw, DialogStage.DRAFT);

        assertThat(envelope.draft()).isNotNull();
        assertThat(envelope.draft().priorities()).isNotEmpty();
        assertThat(envelope.draft().priorities())
                .allSatisfy(priority -> {
                    assertThat(priority.developmentGoal()).isNotBlank();
                    assertThat(priority.competencyCodes()).isSubsetOf("LJD-01", "LJD-02");
                    assertThat(priority.actions()).isNotEmpty();
                    assertThat(priority.actions())
                            .allSatisfy(a -> assertThat(a.action()).isNotBlank());
                });
    }

    @Test
    void активность_подбирается_под_компетенцию_приоритета() {
        String raw = client.chat(
                List.of(ChatMessage.user(CONTEXT.formatted("DRAFT"))),
                LlmParams.of(0.3, 1000));

        AssistantEnvelope envelope = parser.parse(raw, DialogStage.DRAFT);

        assertThat(envelope.draft()).isNotNull();
        assertThat(envelope.draft().priorities())
                .allSatisfy(priority -> {
                    // ACT-001 развивает LJD-01, ACT-004 — LJD-02
                    String expected = priority.competencyCodes().contains("LJD-01") ? "ACT-001" : "ACT-004";
                    assertThat(priority.actions())
                            .anySatisfy(a -> assertThat(a.activityCode()).isEqualTo(expected));
                });
    }

    @Test
    void отказ_от_целевой_роли_не_считается_подтверждением() {
        String prompt = """
                ### Состояние сессии
                {"stage":"CONTEXT","targetRole":"Ведущий разработчик Java"}

                ### КОНТЕКСТ СПРАВОЧНИКОВ
                ### Доступные целевые роли трека "Разработка ПО"
                - Ведущий разработчик Java (выбрана сейчас)
                - Архитектор решений

                ### Сообщение сотрудника
                Нет остаюсь на текущей
                """;

        String raw = client.chat(List.of(ChatMessage.user(prompt)), LlmParams.of(0.3, 1000));
        AssistantEnvelope envelope = parser.parse(raw, DialogStage.CONTEXT);

        assertThat(envelope.nextStage()).isEqualTo("CONTEXT");
        assertThat(envelope.message()).doesNotContain("подтвержден");
        assertThat(envelope.message()).contains("Архитектор решений");
    }

    @Test
    void согласие_переводит_на_gap_анализ() {
        String prompt = CONTEXT.formatted("CONTEXT");

        String raw = client.chat(List.of(ChatMessage.user(prompt)), LlmParams.of(0.3, 1000));
        AssistantEnvelope envelope = parser.parse(raw, DialogStage.CONTEXT);

        assertThat(envelope.nextStage()).isEqualTo("GAP_ANALYSIS");
    }

    @Test
    void в_тексте_для_сотрудника_нет_служебных_кодов_стадий() {
        for (DialogStage stage : DialogStage.values()) {
            String raw = client.chat(
                    List.of(ChatMessage.user(CONTEXT.formatted(stage.name()))),
                    LlmParams.of(0.3, 1000));

            String message = parser.parse(raw, stage).message();

            for (DialogStage name : DialogStage.values()) {
                assertThat(message).as("стадия %s", stage).doesNotContain(name.name());
            }
        }
    }

    @Test
    void без_компетенций_в_контексте_черновик_не_выдумывается() {
        String prompt = """
                ### Состояние сессии
                {"stage":"DRAFT","targetRole":"Неизвестная роль"}

                ### КОНТЕКСТ СПРАВОЧНИКОВ
                (пусто)
                """;

        String raw = client.chat(List.of(ChatMessage.user(prompt)), LlmParams.of(0.3, 1000));
        AssistantEnvelope envelope = parser.parse(raw, DialogStage.DRAFT);

        assertThat(envelope.draft()).isNull();
    }
}
