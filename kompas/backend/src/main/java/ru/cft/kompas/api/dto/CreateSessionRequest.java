package ru.cft.kompas.api.dto;

import jakarta.validation.constraints.NotBlank;

/** Тело POST /api/sessions: токен входа, выданный заглушкой «ПЛАН РАЗВИТИЯ». */
public record CreateSessionRequest(@NotBlank(message = "Не передан токен входа") String token) {
}
