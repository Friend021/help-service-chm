package ru.cft.kompas.v1.sse;

import java.util.List;

/** QUESTIONNAIRE_READY: список навыков для оценки. */
public record QuestionnaireReady(String type, List<SkillItem> skills) implements V1SseEvent {
}
