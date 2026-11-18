package ru.cft.kompas.v1.sse;

/**
 * Общий контракт события SSE нового фронта. Поле {@code type} каждой записи
 * совпадает с именем события (event: name) — как в mock-реализации (auth-mock/src/sse.ts).
 */
public interface V1SseEvent {

    String type();
}
