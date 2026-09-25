package ru.cft.kompas.dialog;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import org.junit.jupiter.api.Test;
import ru.cft.kompas.domain.DialogStage;
import ru.cft.kompas.reference.GoalCategoryCatalog;

class DraftParserTest {

    private final DraftParser parser = new DraftParser(new ObjectMapper(), new GoalCategoryCatalog());

    @Test
    void разбирает_json_в_markdown_обёртке() {
        String raw = """
                Вот ответ:
                ```json
                {"message":"Привет","nextStage":"GAP_ANALYSIS","draft":null}
                ```
                """;

        AssistantEnvelope envelope = parser.parse(raw, DialogStage.CONTEXT);

        assertThat(envelope.message()).isEqualTo("Привет");
        assertThat(envelope.nextStage()).isEqualTo("GAP_ANALYSIS");
        assertThat(envelope.draft()).isNull();
    }

    @Test
    void не_ломается_на_фигурных_скобках_внутри_строк() {
        String raw = "{\"message\":\"текст со скобкой } внутри\",\"nextStage\":\"DRAFT\",\"draft\":null}";

        AssistantEnvelope envelope = parser.parse(raw, DialogStage.CONTEXT);

        assertThat(envelope.message()).isEqualTo("текст со скобкой } внутри");
    }

    @Test
    void неизвестная_стадия_не_двигает_диалог() {
        String raw = "{\"message\":\"ок\",\"nextStage\":\"НЕПОНЯТНО\",\"draft\":null}";

        AssistantEnvelope envelope = parser.parse(raw, DialogStage.INTERESTS);

        assertThat(envelope.nextStage()).isEqualTo("INTERESTS");
    }

    @Test
    void смена_целевой_роли_пробрасывается_из_ответа() {
        String raw = "{\"message\":\"Переключился\",\"nextStage\":\"GAP_ANALYSIS\","
                + "\"targetRole\":\"Архитектор решений\",\"draft\":null}";

        AssistantEnvelope envelope = parser.parse(raw, DialogStage.CONTEXT);

        assertThat(envelope.targetRole()).isEqualTo("Архитектор решений");
    }

    @Test
    void пустая_целевая_роль_не_считается_сменой() {
        String raw = "{\"message\":\"ок\",\"nextStage\":\"CONTEXT\",\"targetRole\":\"  \",\"draft\":null}";

        assertThat(parser.parse(raw, DialogStage.CONTEXT).targetRole()).isNull();
    }

    @Test
    void ответ_без_json_отклоняется() {
        assertThatThrownBy(() -> parser.parse("просто текст", DialogStage.CONTEXT))
                .isInstanceOf(DraftParseException.class);
    }

    @Test
    void ответ_без_message_отклоняется() {
        assertThatThrownBy(() -> parser.parse("{\"nextStage\":\"DRAFT\"}", DialogStage.CONTEXT))
                .isInstanceOf(DraftParseException.class);
    }

    @Test
    void коды_вне_контекста_отбрасываются() {
        DraftDto draft = new DraftDto("Ведущий разработчик Java", List.of(
                new DraftDto.PriorityDto(1, "Адаптация к должности", "Цель по SMART",
                        List.of("LJD-01", "ВЫДУМАННАЯ"),
                        List.of("ACT-001", "ACT-999"),
                        List.of(new DraftDto.MilestoneDto("Точка", "2026-12-31")))));

        DraftDto result = parser.sanitize(draft, List.of("LJD-01"), List.of("ACT-001"));

        assertThat(result.priorities()).hasSize(1);
        assertThat(result.priorities().get(0).competencyCodes()).containsExactly("LJD-01");
        assertThat(result.priorities().get(0).activityCodes()).containsExactly("ACT-001");
    }

    @Test
    void коды_с_префиксом_из_контекста_принимаются() {
        DraftDto draft = new DraftDto("Архитектор решений", List.of(
                new DraftDto.PriorityDto(1, "Адаптация к должности", "Цель по SMART",
                        List.of("COMP:ARC-03", "[COMP:ARC-06]"),
                        List.of("ACT:ACT-017", "[ACT:ACT-010]"),
                        List.of())));

        DraftDto result = parser.sanitize(draft,
                List.of("ARC-03", "ARC-06"), List.of("ACT-017", "ACT-010"));

        assertThat(result.priorities().get(0).competencyCodes()).containsExactly("ARC-03", "ARC-06");
        assertThat(result.priorities().get(0).activityCodes()).containsExactly("ACT-017", "ACT-010");
    }

    @Test
    void категория_цели_вне_справочника_формы_отбрасывается() {
        DraftDto draft = new DraftDto("Роль", List.of(
                new DraftDto.PriorityDto(1, "Профессиональный рост", "Цель",
                        List.of(), List.of(), List.of())));

        DraftDto result = parser.sanitize(draft, List.of(), List.of());

        assertThat(result.priorities().get(0).goalCategory())
                .as("в форме это выпадающий список, своя формулировка туда не встанет")
                .isNull();
    }

    @Test
    void категория_из_справочника_нормализуется_по_регистру() {
        DraftDto draft = new DraftDto("Роль", List.of(
                new DraftDto.PriorityDto(1, "  адаптация К ДОЛЖНОСТИ ", "Цель",
                        List.of(), List.of(), List.of())));

        DraftDto result = parser.sanitize(draft, List.of(), List.of());

        assertThat(result.priorities().get(0).goalCategory()).isEqualTo("Адаптация к должности");
    }

    @Test
    void приоритеты_без_цели_отбрасываются_и_нумерация_сквозная() {
        DraftDto draft = new DraftDto("Роль", List.of(
                new DraftDto.PriorityDto(1, null, "  ", List.of(), List.of(), List.of()),
                new DraftDto.PriorityDto(7, null, "Вторая цель", List.of("LJD-01"), List.of(), List.of())));

        DraftDto result = parser.sanitize(draft, List.of("LJD-01"), List.of());

        assertThat(result.priorities()).hasSize(1);
        assertThat(result.priorities().get(0).order()).isEqualTo(1);
        assertThat(result.priorities().get(0).developmentGoal()).isEqualTo("Вторая цель");
    }
}
