package ru.cft.kompas.dialog;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import ru.cft.kompas.domain.DialogStage;
import ru.cft.kompas.domain.Idp;
import ru.cft.kompas.domain.IdpPriority;

/**
 * Переход DRAFT → REFINE не должен зависеть от того, вспомнит ли о нём модель:
 * зависание на DRAFT приводило к тому, что правки сотрудника обрабатывались
 * промптом сборки черновика вместо промпта доработки.
 */
class StageTransitionTest {

    @Test
    void с_готовым_планом_стадия_draft_переводится_в_refine() {
        AssistantEnvelope envelope = new AssistantEnvelope("Собрал черновик", "DRAFT", null, null);

        assertThat(DialogOrchestrator.resolveNextStage(envelope, idpWithPriorities()))
                .isEqualTo(DialogStage.REFINE);
    }

    @Test
    void без_плана_стадия_draft_сохраняется() {
        AssistantEnvelope envelope = new AssistantEnvelope("Сейчас соберу", "DRAFT", null, null);

        assertThat(DialogOrchestrator.resolveNextStage(envelope, new Idp()))
                .isEqualTo(DialogStage.DRAFT);
    }

    @Test
    void остальные_стадии_остаются_за_моделью() {
        for (DialogStage stage : DialogStage.values()) {
            if (stage == DialogStage.DRAFT) {
                continue;
            }
            AssistantEnvelope envelope = new AssistantEnvelope("текст", stage.name(), null, null);

            assertThat(DialogOrchestrator.resolveNextStage(envelope, idpWithPriorities()))
                    .as("стадия %s", stage)
                    .isEqualTo(stage);
        }
    }

    private static Idp idpWithPriorities() {
        Idp idp = new Idp();
        IdpPriority priority = new IdpPriority();
        priority.setOrderNo(1);
        priority.setDevelopmentGoal("Цель");
        idp.getPriorities().add(priority);
        return idp;
    }
}
