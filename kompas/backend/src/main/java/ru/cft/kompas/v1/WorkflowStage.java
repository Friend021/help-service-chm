package ru.cft.kompas.v1;

import ru.cft.kompas.domain.DialogSession;
import ru.cft.kompas.domain.DialogStage;

/**
 * Стадии мастера нового фронта (totalSteps=5). Коды и подписи — из mock idp.ts
 * (STAGE_LABELS). Используются справочником стадий, контекстом сессии и мостом SSE.
 */
public enum WorkflowStage {

    STAGE_1_CONTEXT(1, "Контекст сотрудника"),
    STAGE_1_2_ONBOARDING(1, "Ввод текущей и целевой должности"),
    STAGE_2_QUESTIONNAIRE(2, "Оценка навыков по профилю должности"),
    STAGE_3_DRAFT_GEN(3, "Формирование черновика ИПР"),
    STAGE_4_REFINEMENT(4, "Корректировка черновика"),
    STAGE_5_COMPLETED(5, "Готово к переносу в «План развития»");

    public static final int TOTAL_STEPS = 5;

    private final int stepNumber;
    private final String label;

    WorkflowStage(int stepNumber, String label) {
        this.stepNumber = stepNumber;
        this.label = label;
    }

    public int stepNumber() {
        return stepNumber;
    }

    public String label() {
        return label;
    }

    /** Отображение стадии оркестратора в стадию мастера фронта. */
    public static WorkflowStage of(DialogStage stage) {
        return switch (stage) {
            case CONTEXT -> STAGE_1_CONTEXT;
            case GAP_ANALYSIS, INTERESTS -> STAGE_2_QUESTIONNAIRE;
            case DRAFT -> STAGE_3_DRAFT_GEN;
            case REFINE -> STAGE_4_REFINEMENT;
            case FINALIZE -> STAGE_5_COMPLETED;
        };
    }

    /**
     * Стадия, которую видит фронт для открытой сессии.
     * Пока контекст (должности) не подтверждён — сессия стоит на вводе/подтверждении
     * должностей (онбординг), даже если должности уже известны;
     * после подтверждения стадия выводится из стадии оркестратора.
     */
    public static WorkflowStage of(DialogSession session) {
        if (!session.isContextConfirmed()) {
            return STAGE_1_2_ONBOARDING;
        }
        return of(session.getStage());
    }
}
