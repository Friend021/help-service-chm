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

        assertThat(parser.parse(raw, DialogStage.CONTEXT).message())
                .isEqualTo("текст со скобкой } внутри");
    }

    @Test
    void неизвестная_стадия_не_двигает_диалог() {
        String raw = "{\"message\":\"ок\",\"nextStage\":\"НЕПОНЯТНО\",\"draft\":null}";

        assertThat(parser.parse(raw, DialogStage.INTERESTS).nextStage()).isEqualTo("INTERESTS");
    }

    @Test
    void смена_целевой_роли_пробрасывается_из_ответа() {
        String raw = "{\"message\":\"Переключился\",\"nextStage\":\"GAP_ANALYSIS\","
                + "\"targetRole\":\"Архитектор решений\",\"draft\":null}";

        assertThat(parser.parse(raw, DialogStage.CONTEXT).targetRole()).isEqualTo("Архитектор решений");
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
        DraftDto draft = draftWith(priority(List.of("LJD-01", "ВЫДУМАННАЯ"),
                action("Развитие на рабочем месте", "ACT-001", "Спроектировать API"),
                action("Развитие на рабочем месте", "ACT-999", "Сделать что-то ещё")));

        DraftDto result = parser.sanitize(draft, List.of("LJD-01"), List.of("ACT-001"));

        DraftDto.PriorityDto kept = result.priorities().get(0);
        assertThat(kept.competencyCodes()).containsExactly("LJD-01");
        assertThat(kept.actions()).hasSize(2);
        assertThat(kept.actions().get(0).activityCode()).isEqualTo("ACT-001");
        assertThat(kept.actions().get(1).activityCode())
                .as("ссылка на активность вне контекста снимается, само действие остаётся")
                .isNull();
    }

    @Test
    void коды_с_префиксом_из_контекста_принимаются() {
        DraftDto draft = draftWith(priority(List.of("COMP:ARC-03", "[COMP:ARC-06]"),
                action("Развитие через других", "[ACT:ACT-022]", "Выступить на митапе")));

        DraftDto result = parser.sanitize(draft, List.of("ARC-03", "ARC-06"), List.of("ACT-022"));

        assertThat(result.priorities().get(0).competencyCodes()).containsExactly("ARC-03", "ARC-06");
        assertThat(result.priorities().get(0).actions().get(0).activityCode()).isEqualTo("ACT-022");
    }

    @Test
    void инструмент_вне_справочника_формы_заменяется_безопасным() {
        DraftDto draft = draftWith(priority(List.of(),
                action("Самообучение по вечерам", null, "Читать статьи")));

        DraftDto result = parser.sanitize(draft, List.of(), List.of());

        assertThat(result.priorities().get(0).actions().get(0).instrument())
                .isEqualTo("Развитие на рабочем месте");
    }

    @Test
    void действия_без_текста_отбрасываются() {
        DraftDto draft = draftWith(priority(List.of(),
                action("Развитие на рабочем месте", null, "  "),
                action("Развитие через других", null, "Разобрать решение с наставником")));

        DraftDto result = parser.sanitize(draft, List.of(), List.of());

        assertThat(result.priorities().get(0).actions()).hasSize(1);
        assertThat(result.priorities().get(0).actions().get(0).action())
                .isEqualTo("Разобрать решение с наставником");
    }

    @Test
    void категория_цели_вне_справочника_формы_отбрасывается() {
        DraftDto draft = draftWith(new DraftDto.PriorityDto(
                1, "Профессиональный рост", "Цель", List.of(), List.of()));

        DraftDto result = parser.sanitize(draft, List.of(), List.of());

        assertThat(result.priorities().get(0).goalCategory())
                .as("в форме это выпадающий список, своя формулировка туда не встанет")
                .isNull();
    }

    @Test
    void категория_из_справочника_нормализуется_по_регистру() {
        DraftDto draft = draftWith(new DraftDto.PriorityDto(
                1, "  адаптация К ДОЛЖНОСТИ ", "Цель", List.of(), List.of()));

        DraftDto result = parser.sanitize(draft, List.of(), List.of());

        assertThat(result.priorities().get(0).goalCategory()).isEqualTo("Адаптация к должности");
    }

    @Test
    void приоритеты_без_цели_отбрасываются_и_нумерация_сквозная() {
        DraftDto draft = new DraftDto("Роль", List.of(
                new DraftDto.PriorityDto(1, null, "  ", List.of(), List.of()),
                new DraftDto.PriorityDto(7, null, "Вторая цель", List.of("LJD-01"), List.of())));

        DraftDto result = parser.sanitize(draft, List.of("LJD-01"), List.of());

        assertThat(result.priorities()).hasSize(1);
        assertThat(result.priorities().get(0).order()).isEqualTo(1);
        assertThat(result.priorities().get(0).developmentGoal()).isEqualTo("Вторая цель");
    }

    private static DraftDto draftWith(DraftDto.PriorityDto... priorities) {
        return new DraftDto("Ведущий разработчик Java", List.of(priorities));
    }

    private static DraftDto.PriorityDto priority(List<String> competencies,
                                                 DraftDto.ActionDto... actions) {
        return new DraftDto.PriorityDto(1, "Адаптация к должности", "Цель по SMART",
                competencies, List.of(actions));
    }

    private static DraftDto.ActionDto action(String instrument, String activityCode, String text) {
        return new DraftDto.ActionDto(instrument, activityCode, text, "2026-12-31");
    }
}
