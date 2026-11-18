package ru.cft.kompas.v1.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

/** Тело POST /api/v1/chat/dialog: message может отсутствовать (старт/повтор диалога). */
@JsonIgnoreProperties(ignoreUnknown = true)
public record DialogRequest(String message) {
}
