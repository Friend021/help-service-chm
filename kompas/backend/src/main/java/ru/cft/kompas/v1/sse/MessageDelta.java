package ru.cft.kompas.v1.sse;

/** MESSAGE_DELTA: очередная порция ассистентского текста (messageId стабилен для всех дельт). */
public record MessageDelta(String type, String messageId, String delta) implements V1SseEvent {
}
