package ru.cft.kompas.dialog;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import java.util.List;

/** Машиночитаемая часть ответа LLM — черновик ИПР. */
@JsonIgnoreProperties(ignoreUnknown = true)
public record DraftDto(String targetRole, List<PriorityDto> priorities) {

    /** Строка блока «Приоритеты развития» вместе со своими развивающими действиями. */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record PriorityDto(Integer order,
                              String goalCategory,
                              String developmentGoal,
                              List<String> competencyCodes,
                              List<ActionDto> actions) {
    }

    /**
     * Строка таблицы «как развиваем» под целью: инструмент, конкретное действие,
     * планируемый срок. Статус проставляет сервис — в новом плане он всегда
     * «Не начато».
     */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record ActionDto(String instrument,
                            String activityCode,
                            String action,
                            String dueDate) {
    }
}
