package ru.cft.kompas.v1.dto;

import java.time.Instant;

/** Сообщение истории чата (роль в нижнем регистре, как ждёт фронт). */
public record V1ChatMessage(Long id, String role, String content, Instant createdAt) {
}
