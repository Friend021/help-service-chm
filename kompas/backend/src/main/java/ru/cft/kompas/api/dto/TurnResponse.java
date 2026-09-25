package ru.cft.kompas.api.dto;

import ru.cft.kompas.export.IdpView;

/**
 * Ответ на ход диалога.
 *
 * @param targetRole целевая роль сессии после хода — она могла смениться по просьбе сотрудника
 */
public record TurnResponse(String assistantMessage, StageDto stage, String targetRole, IdpView idp) {
}
