package ru.cft.kompas.dialog;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import java.util.List;

/** Машиночитаемая часть ответа LLM — черновик ИПР. */
@JsonIgnoreProperties(ignoreUnknown = true)
public record DraftDto(String targetRole, List<PriorityDto> priorities) {

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record PriorityDto(Integer order,
                              String goalCategory,
                              String developmentGoal,
                              List<String> competencyCodes,
                              List<String> activityCodes,
                              List<MilestoneDto> milestones) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record MilestoneDto(String title, String dueDate) {
    }
}
