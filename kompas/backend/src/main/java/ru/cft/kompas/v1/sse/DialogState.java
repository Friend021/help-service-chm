package ru.cft.kompas.v1.sse;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.List;

/** DIALOG_STATE: грубое состояние диалога, синтезированное из стадии оркестратора. */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record DialogState(String type, boolean active, int step, int answered, int total,
                          List<String> suggestions) implements V1SseEvent {
}
