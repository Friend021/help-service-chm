package ru.cft.kompas.v1.dto;

/** Тело POST /api/v1/session/context/manual. */
public record V1ManualContextRequest(String currentPosition, String targetPosition) {
}
