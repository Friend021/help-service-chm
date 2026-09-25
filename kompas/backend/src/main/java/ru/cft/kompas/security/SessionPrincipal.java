package ru.cft.kompas.security;

/** Кто выполняет запрос к API: сессия диалога и сотрудник. */
public record SessionPrincipal(Long sessionId, Long employeeId) {

    public static final String ATTRIBUTE = "kompas.principal";
}
