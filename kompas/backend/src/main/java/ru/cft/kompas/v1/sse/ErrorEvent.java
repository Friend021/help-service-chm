package ru.cft.kompas.v1.sse;

/** ERROR: терминальная ошибка потока (code — машинный код, message — текст для пользователя). */
public record ErrorEvent(String type, String code, String message) implements V1SseEvent {
}
