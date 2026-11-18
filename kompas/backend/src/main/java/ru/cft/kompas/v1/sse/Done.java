package ru.cft.kompas.v1.sse;

/** DONE: поток завершён. */
public record Done(String type) implements V1SseEvent {
}
