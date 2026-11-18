package ru.cft.kompas.v1.api;

import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import ru.cft.kompas.api.dto.ErrorResponse;
import ru.cft.kompas.security.InvalidTokenException;
import ru.cft.kompas.v1.dto.V1ExportErrorResponse;
import ru.cft.kompas.v1.security.KeycloakAuthException;

/**
 * Ошибки авторизации Keycloak, всплывшие из контроллеров /api/v1 (не из фильтра),
 * отдаются в той же JSON-форме {"error": "..."}, что и легаси-слой.
 * Неполный план при экспорте — 422 в форме mock /idp/export.
 *
 * Высший приоритет: иначе catch-all @ExceptionHandler(Exception.class) легаси-advice
 * мог бы перехватить наши v1-исключения (порядок между unordered advice недетерминирован).
 */
@Order(Ordered.HIGHEST_PRECEDENCE)
@RestControllerAdvice(basePackages = "ru.cft.kompas.v1")
public class V1ExceptionHandler {

    @ExceptionHandler(KeycloakAuthException.class)
    public ResponseEntity<ErrorResponse> onKeycloakAuth(KeycloakAuthException e) {
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(new ErrorResponse(e.getMessage()));
    }

    @ExceptionHandler(InvalidTokenException.class)
    public ResponseEntity<ErrorResponse> onInvalidEntryToken(InvalidTokenException e) {
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(new ErrorResponse(e.getMessage()));
    }

    @ExceptionHandler(V1PlanInvalidException.class)
    public ResponseEntity<V1ExportErrorResponse> onPlanInvalid(V1PlanInvalidException e) {
        return ResponseEntity.status(HttpStatus.UNPROCESSABLE_ENTITY).body(new V1ExportErrorResponse(
                false, "validation_error", e.getMessage(), e.errors()));
    }
}
