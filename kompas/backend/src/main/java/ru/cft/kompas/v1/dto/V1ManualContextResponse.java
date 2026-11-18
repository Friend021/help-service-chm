package ru.cft.kompas.v1.dto;

/** Ответ POST /api/v1/session/context/manual. */
public record V1ManualContextResponse(V1EmployeeContext context, String stage) {
}
