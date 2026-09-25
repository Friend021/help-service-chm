package ru.cft.legacy.model;

import java.util.List;
import java.util.Map;

/**
 * План, вернувшийся из «Компаса»: строки уже разложены по колонкам формы
 * «Приоритеты развития» и отсортированы по номеру приоритета.
 */
public record ImportedPlan(String employeeExternalId,
                           String employeeName,
                           String managerName,
                           String currentPosition,
                           String targetRole,
                           String date,
                           List<Row> rows) {

    public record Row(int order, String category, String goal, String competencies, String activities) {

        static Row from(Map<String, Object> raw) {
            Object order = raw.get("order");
            return new Row(order instanceof Number number ? number.intValue() : 0,
                    text(raw.get("category")),
                    text(raw.get("goal")),
                    text(raw.get("competencies")),
                    text(raw.get("activities")));
        }

        private static String text(Object value) {
            return value == null ? "" : String.valueOf(value);
        }
    }

    public static List<Row> rows(List<Map<String, Object>> raw) {
        return raw == null ? List.of() : raw.stream().map(Row::from).toList();
    }
}
