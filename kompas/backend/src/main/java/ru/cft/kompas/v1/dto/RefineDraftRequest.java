package ru.cft.kompas.v1.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

/** Тело POST /api/v1/chat/refine-draft. */
@JsonIgnoreProperties(ignoreUnknown = true)
public record RefineDraftRequest(String message) {
}
