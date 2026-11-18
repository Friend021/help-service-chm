package ru.cft.kompas.v1.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

/** Обёртка {plan} — тело PUT /api/v1/idp/draft (и будущих эндпоинтов). */
@JsonIgnoreProperties(ignoreUnknown = true)
public record V1PlanEnvelope(V1Plan plan) {
}
