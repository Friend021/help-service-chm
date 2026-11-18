package ru.cft.kompas.v1.sse;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.List;
import ru.cft.kompas.v1.dto.V1Plan;

/** PLAN_DRAFT_UPDATE: обновлённый черновик плана; validationErrors опускается, когда его нет. */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record PlanDraftUpdate(String type, V1Plan plan, List<String> validationErrors) implements V1SseEvent {
}
