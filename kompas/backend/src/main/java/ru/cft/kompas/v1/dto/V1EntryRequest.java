package ru.cft.kompas.v1.dto;

import jakarta.validation.constraints.NotBlank;

/** Тело POST /api/v1/session/entry — токен входа из «ПЛАН РАЗВИТИЯ» (HS256). */
public record V1EntryRequest(@NotBlank String token) {
}
