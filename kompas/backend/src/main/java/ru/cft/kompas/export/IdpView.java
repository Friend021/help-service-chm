package ru.cft.kompas.export;

import java.time.LocalDate;
import java.util.List;

/** Плоское представление ИПР для экспорта и API. */
public record IdpView(Long id,
                      LocalDate date,
                      String status,
                      String employeeName,
                      String managerName,
                      String currentPosition,
                      String targetRole,
                      List<PriorityView> priorities) {

    public record PriorityView(Integer order,
                               String developmentGoal,
                               List<NamedRef> competencies,
                               List<NamedRef> activities,
                               List<MilestoneView> milestones) {
    }

    public record NamedRef(String code, String name, String extra) {
    }

    public record MilestoneView(String title, String dueDate, String status) {
    }
}
