package ru.cft.kompas.v1.dto;

import java.util.List;

/** Ответ 422 POST /api/v1/idp/export при неполном плане (форма как в mock /idp/export). */
public record V1ExportErrorResponse(boolean success, String error, String message, List<V1PlanError> errors) {
}
