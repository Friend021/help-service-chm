package ru.cft.kompas.v1.mapping;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.List;
import org.springframework.stereotype.Component;
import ru.cft.kompas.dialog.DraftDto;
import ru.cft.kompas.domain.DevelopmentAction;
import ru.cft.kompas.domain.Idp;
import ru.cft.kompas.domain.IdpPriority;
import ru.cft.kompas.reference.GoalCategoryCatalog;
import ru.cft.kompas.v1.dto.V1Direction;
import ru.cft.kompas.v1.dto.V1Plan;
import ru.cft.kompas.v1.dto.V1Task;

/**
 * Маппинг плана фронт ⇄ бэк (раздел «Маппинг плана» плана интеграции).
 *
 * Читается из сущности Idp (а не из IdpView): IdpView не несёт новых колонок
 * mainGoal и task.comment и правке не подлежит (единственная допустимая легаси-правка —
 * AccessTokenFilter), а имена компетенций модель фронта не использует.
 * Конвертация deadLine(ISO UTC) ⇄ dueDate(LocalDate) делается здесь, не через IdpService.parseDate.
 */
@Component
public class PlanMapper {

    private final GoalCategoryCatalog goalCategories;

    public PlanMapper(GoalCategoryCatalog goalCategories) {
        this.goalCategories = goalCategories;
    }

    /** Чтение: сущность ИПР → модель плана фронта. */
    public V1Plan toPlan(Idp idp) {
        if (idp == null) {
            return new V1Plan("", List.of());
        }
        List<V1Direction> directions = new ArrayList<>();
        for (IdpPriority priority : idp.getPriorities()) {
            List<V1Task> tasks = new ArrayList<>();
            for (DevelopmentAction action : priority.getActions()) {
                tasks.add(new V1Task(
                        action.getInstrument().getTitle(),
                        action.getComment() == null ? "" : action.getComment(),
                        toDeadLine(action.getDueDate()),
                        action.getAction()));
            }
            directions.add(new V1Direction(
                    toRank(priority.getOrderNo()),
                    priority.getGoalCategory() == null ? "" : priority.getGoalCategory(),
                    priority.getDevelopmentGoal() == null ? "" : priority.getDevelopmentGoal(),
                    priority.getCompetencyCodes() == null ? List.of() : List.copyOf(priority.getCompetencyCodes()),
                    tasks));
        }
        return new V1Plan(idp.getMainGoal() == null ? "" : idp.getMainGoal(), directions);
    }

    /** Запись: модель плана фронта → DraftDto для IdpService.applyDraft (базовые поля). */
    public DraftDto toDraft(V1Plan plan, String targetRoleTitle) {
        List<DraftDto.PriorityDto> priorities = new ArrayList<>();
        if (plan != null && plan.directions() != null) {
            for (V1Direction direction : plan.directions()) {
                List<DraftDto.ActionDto> actions = new ArrayList<>();
                List<V1Task> tasks = direction.tasks() == null ? List.of() : direction.tasks();
                for (V1Task task : tasks) {
                    actions.add(new DraftDto.ActionDto(
                            task.developmentTool(),
                            null,
                            task.description(),
                            toDueDateString(task.deadLine())));
                }
                priorities.add(new DraftDto.PriorityDto(
                        toOrderNo(direction.rank()),
                        normalizeGoal(direction.goal()),
                        direction.description(),
                        direction.competencyCodes(),
                        actions));
            }
        }
        return new DraftDto(targetRoleTitle, priorities);
    }

    /**
     * Проставляет поля, которых нет в DraftDto/applyDraft: mainGoal и комментарии к действиям.
     * Вызывается после applyDraft — приоритеты уже пересобраны в порядке направлений плана,
     * а действия отфильтрованы так же, как в applyDraft (пустое описание пропускается).
     */
    public static void persistExtras(Idp idp, V1Plan plan) {
        idp.setMainGoal(plan == null ? null : plan.mainGoal());
        if (plan == null || plan.directions() == null) {
            return;
        }
        List<IdpPriority> priorities = idp.getPriorities();
        int size = Math.min(priorities.size(), plan.directions().size());
        for (int i = 0; i < size; i++) {
            List<DevelopmentAction> actions = priorities.get(i).getActions();
            List<V1Task> tasks = plan.directions().get(i).tasks() == null
                    ? List.of() : plan.directions().get(i).tasks();
            int ai = 0;
            for (V1Task task : tasks) {
                if (task.description() == null || task.description().isBlank()) {
                    continue;
                }
                if (ai < actions.size()) {
                    actions.get(ai).setComment(blankToNull(task.comment()));
                    ai++;
                }
            }
        }
    }

    private String normalizeGoal(String goal) {
        if (goal == null || goal.isBlank()) {
            return goal;
        }
        // snap: точное совпадение, иначе ближайшая категория справочника — чтобы
        // выпадающий список формы всегда мог выбрать значение (не оставался пустым).
        String snapped = goalCategories.snap(goal);
        return snapped == null ? goal : snapped;
    }

    private static int toRank(Integer orderNo) {
        if (orderNo == null) {
            return 0;
        }
        return Math.max(0, Math.min(2, orderNo - 1));
    }

    private static int toOrderNo(int rank) {
        return rank + 1;
    }

    /** dueDate(LocalDate) → deadLine (ISO 8601 UTC, суффикс Z); null → пустая строка (черновик). */
    private static String toDeadLine(LocalDate dueDate) {
        if (dueDate == null) {
            return "";
        }
        return dueDate.atTime(12, 0).atOffset(ZoneOffset.UTC).toInstant().toString();
    }

    /** deadLine (ISO 8601 UTC) → строка даты для applyDraft; пусто/битое → null. */
    private static String toDueDateString(String deadLine) {
        if (deadLine == null || deadLine.isBlank()) {
            return null;
        }
        try {
            return OffsetDateTime.parse(deadLine).atZoneSameInstant(ZoneOffset.UTC).toLocalDate().toString();
        } catch (DateTimeParseException e) {
            return null;
        }
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value;
    }
}
