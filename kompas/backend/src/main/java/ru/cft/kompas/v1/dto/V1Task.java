package ru.cft.kompas.v1.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

/**
 * Задача внутри направления плана. Поля совпадают с mock IdpTask.
 * Опциональные commentAuthor/commentCreatedAt фронта терпимо игнорируются.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public record V1Task(String developmentTool, String comment, String deadLine, String description) {
}
