package ru.cft.kompas.v1.dto;

/** Успешный ответ POST /api/v1/idp/export. */
public record V1ExportResponse(boolean success, String returnUrl) {
}
