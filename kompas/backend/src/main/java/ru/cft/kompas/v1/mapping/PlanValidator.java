package ru.cft.kompas.v1.mapping;

import java.time.OffsetDateTime;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import org.springframework.stereotype.Component;
import ru.cft.kompas.domain.DevelopmentInstrument;
import ru.cft.kompas.reference.GoalCategoryCatalog;
import ru.cft.kompas.v1.dto.V1Direction;
import ru.cft.kompas.v1.dto.V1Plan;
import ru.cft.kompas.v1.dto.V1PlanError;
import ru.cft.kompas.v1.dto.V1Task;

/**
 * Правило «полноты» плана — порт строгой схемы мока (idpPlanSchema из schemas.ts).
 * Направления сверяются с нашим справочником целей, инструменты — с нашими названиями
 * (DevelopmentInstrument), дата — ISO 8601 UTC с суффиксом Z.
 *
 * {@link #validate(V1Plan)} возвращает список ошибок по путям (как formatIssues мока);
 * {@link #isValid(V1Plan)} — быстрый флаг поверх него.
 */
@Component
public class PlanValidator {

    private static final Pattern DEADLINE =
            Pattern.compile("^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,3})?Z$");

    private final GoalCategoryCatalog goalCategories;

    public PlanValidator(GoalCategoryCatalog goalCategories) {
        this.goalCategories = goalCategories;
    }

    public boolean isValid(V1Plan plan) {
        return validate(plan).isEmpty();
    }

    /** Список ошибок валидации (пустой — план готов к экспорту). */
    public List<V1PlanError> validate(V1Plan plan) {
        List<V1PlanError> errors = new ArrayList<>();
        if (plan == null) {
            errors.add(new V1PlanError("(root)", "План не передан"));
            return errors;
        }
        if (isBlank(plan.mainGoal())) {
            errors.add(new V1PlanError("mainGoal", "Ключевая цель обязательна"));
        }
        if (plan.directions() == null || plan.directions().isEmpty()) {
            errors.add(new V1PlanError("directions", "Нужно хотя бы одно направление развития"));
            return errors;
        }

        Set<String> directions = Set.copyOf(goalCategories.all());
        Set<String> tools = java.util.Arrays.stream(DevelopmentInstrument.values())
                .map(DevelopmentInstrument::getTitle)
                .collect(Collectors.toSet());

        List<V1Direction> list = plan.directions();
        for (int i = 0; i < list.size(); i++) {
            V1Direction direction = list.get(i);
            String base = "directions." + i;
            if (direction.rank() < 0 || direction.rank() > 2) {
                errors.add(new V1PlanError(base + ".rank", "Приоритет должен быть 0, 1 или 2"));
            }
            if (direction.goal() == null || !directions.contains(direction.goal())) {
                errors.add(new V1PlanError(base + ".goal", "Недопустимое направление развития"));
            }
            if (isBlank(direction.description())) {
                errors.add(new V1PlanError(base + ".description",
                        "Опишите, что важно развить внутри направления"));
            }
            if (direction.tasks() == null || direction.tasks().isEmpty()) {
                errors.add(new V1PlanError(base + ".tasks", "Нужно хотя бы одно конкретное действие"));
                continue;
            }
            List<V1Task> tasks = direction.tasks();
            for (int j = 0; j < tasks.size(); j++) {
                V1Task task = tasks.get(j);
                String taskBase = base + ".tasks." + j;
                if (task.developmentTool() == null || !tools.contains(task.developmentTool())) {
                    errors.add(new V1PlanError(taskBase + ".developmentTool", "Недопустимый инструмент развития"));
                }
                if (!isValidDeadLine(task.deadLine())) {
                    errors.add(new V1PlanError(taskBase + ".deadLine", "Дата должна быть в UTC (суффикс Z)"));
                }
                if (isBlank(task.description())) {
                    errors.add(new V1PlanError(taskBase + ".description", "Опишите, что именно предстоит делать"));
                }
            }
        }
        return errors;
    }

    private static boolean isValidDeadLine(String value) {
        if (value == null || !DEADLINE.matcher(value).matches()) {
            return false;
        }
        try {
            OffsetDateTime.parse(value);
            return true;
        } catch (DateTimeParseException e) {
            return false;
        }
    }

    private static boolean isBlank(String value) {
        return value == null || value.trim().isEmpty();
    }
}
