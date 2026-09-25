package ru.cft.kompas.api.dto;

import java.time.Instant;

public record MessageDto(Long id, String role, String content, Instant createdAt) {
}
