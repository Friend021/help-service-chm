package ru.cft.kompas.v1.sse;

/**
 * Навык опросника. Поля совпадают с mock SkillAssessmentItem:
 * skillId — код компетенции, rating=null пока не выставлена оценка.
 */
public record SkillItem(String skillId, String skillName, String description, Integer rating) {
}
