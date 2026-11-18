package ru.cft.kompas.v1.sse;

/** STAGE_UPDATE: текущая стадия мастера и номер шага. */
public record StageUpdate(String type, String stage, int stepNumber, int totalSteps) implements V1SseEvent {
}
