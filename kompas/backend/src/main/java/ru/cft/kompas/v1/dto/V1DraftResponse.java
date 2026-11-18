package ru.cft.kompas.v1.dto;

/** Ответ GET/PUT /api/v1/idp/draft. */
public record V1DraftResponse(V1Plan plan, boolean isValid) {
}
