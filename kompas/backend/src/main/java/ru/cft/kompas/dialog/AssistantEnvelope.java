package ru.cft.kompas.dialog;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

/**
 * Разобранный ответ ассистента: текст в чат, стадия, запрошенная смена целевой роли
 * и черновик.
 *
 * @param targetRole название роли, на которую сотрудник попросил переключиться,
 *                   или null, если роль не меняется
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public record AssistantEnvelope(String message, String nextStage, String targetRole, DraftDto draft) {
}
