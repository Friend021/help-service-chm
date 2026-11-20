package ru.cft.kompas.export;

import java.time.LocalDate;
import java.util.List;

/** Плоское представление ИПР для экспорта, API и переноса в форму. */
public record IdpView(Long id,
                      LocalDate date,
                      String status,
                      String employeeExternalId,
                      String employeeName,
                      String managerName,
                      String currentPosition,
                      String targetRole,
                      String mainGoal,
                      List<PriorityView> priorities) {

    public record PriorityView(Integer order,
                               String goalCategory,
                               String developmentGoal,
                               List<NamedRef> competencies,
                               List<ActionView> actions) {
    }

    public record NamedRef(String code, String name, String extra) {
    }

    /**
     * Строка блока «как развиваем» под целью.
     *
     * @param instrument   значение выпадающего списка «Инструмент развития»
     * @param activityName название активности каталога, если действие взято оттуда
     * @param source       откуда активность (Учебный центр, рабочие задачи и т.п.)
     */
    public record ActionView(String instrument,
                             String activityCode,
                             String activityName,
                             String source,
                             String action,
                             String dueDate,
                             String status) {
    }
}
