package ru.cft.kompas.v1.dto;

import java.util.List;

/** Ответ GET /api/v1/chat/messages. */
public record V1ChatMessagesResponse(List<V1ChatMessage> messages) {
}
