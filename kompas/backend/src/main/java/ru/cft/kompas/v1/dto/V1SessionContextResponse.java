package ru.cft.kompas.v1.dto;

/** Ответ GET /api/v1/session/context. */
public record V1SessionContextResponse(V1EmployeeContext context,
                                       String scenario,
                                       String stage,
                                       boolean isNewEmployee,
                                       String returnUrl) {
}
