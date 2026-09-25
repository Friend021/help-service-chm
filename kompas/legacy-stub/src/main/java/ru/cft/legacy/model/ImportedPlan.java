package ru.cft.legacy.model;

import java.util.List;
import java.util.Map;

/**
 * План, вернувшийся из «Компаса»: строки уже разложены по колонкам формы
 * «Приоритеты развития» и отсортированы по номеру приоритета, а у каждой цели
 * готов свой блок развивающих действий.
 */
public record ImportedPlan(String employeeExternalId,
                           String employeeName,
                           String managerName,
                           String currentPosition,
                           String targetRole,
                           String date,
                           List<Row> rows) {

    public record Row(int order, String category, String goal, String competencies,
                      List<Action> actions) {

        static Row from(Map<String, Object> raw) {
            return new Row(toInt(raw.get("order")),
                    text(raw.get("category")),
                    text(raw.get("goal")),
                    text(raw.get("competencies")),
                    parseActions(raw.get("actions")));
        }

        /** Заголовок блока действий под целью — то, что стоит в колонке «Что развиваем?». */
        public String title() {
            return competencies.isBlank() ? goal : competencies;
        }
    }

    /** Строка таблицы «Инструмент развития / Конкретное действие / Срок / Статус». */
    public record Action(int number, String instrument, String action, String dueDate, String status) {

        static Action from(Map<String, Object> raw) {
            return new Action(toInt(raw.get("number")),
                    text(raw.get("instrument")),
                    text(raw.get("action")),
                    text(raw.get("dueDate")),
                    text(raw.get("status")));
        }
    }

    public static List<Row> rows(List<Map<String, Object>> raw) {
        return raw == null ? List.of() : raw.stream().map(Row::from).toList();
    }

    @SuppressWarnings("unchecked")
    private static List<Action> parseActions(Object raw) {
        if (!(raw instanceof List<?> list)) {
            return List.of();
        }
        return list.stream()
                .filter(Map.class::isInstance)
                .map(item -> Action.from((Map<String, Object>) item))
                .toList();
    }

    private static String text(Object value) {
        return value == null ? "" : String.valueOf(value);
    }

    private static int toInt(Object value) {
        return value instanceof Number n ? n.intValue() : 0;
    }
}
