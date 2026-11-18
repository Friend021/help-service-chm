package ru.cft.kompas.v1.sse;

import java.util.List;
import ru.cft.kompas.v1.WorkflowStage;
import ru.cft.kompas.v1.dto.V1Plan;

/**
 * Фабрика payload-записей SSE. У каждой записи поле {@code type} равно имени события,
 * совпадающему с mock-контрактом (auth-mock/src/types.ts).
 */
public final class SseEvents {

    private SseEvents() {
    }

    public static StageUpdate stage(WorkflowStage stage) {
        return new StageUpdate("STAGE_UPDATE", stage.name(), stage.stepNumber(), WorkflowStage.TOTAL_STEPS);
    }

    public static MessageDelta messageDelta(String messageId, String delta) {
        return new MessageDelta("MESSAGE_DELTA", messageId, delta);
    }

    public static QuestionnaireReady questionnaireReady(List<SkillItem> skills) {
        return new QuestionnaireReady("QUESTIONNAIRE_READY", skills);
    }

    public static PlanDraftUpdate planDraft(V1Plan plan) {
        return new PlanDraftUpdate("PLAN_DRAFT_UPDATE", plan, null);
    }

    public static DialogState dialogState(boolean active, int step, int answered, int total) {
        return new DialogState("DIALOG_STATE", active, step, answered, total, null);
    }

    public static Done done() {
        return new Done("DONE");
    }

    public static ErrorEvent error(String code, String message) {
        return new ErrorEvent("ERROR", code, message);
    }
}
