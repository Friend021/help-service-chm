package ru.cft.kompas.v1.dto;

import java.util.List;

/** Ответ POST /api/v1/chat/confirm (форма как в mock /chat/confirm). */
public record V1ConfirmResponse(String stage,
                                V1Plan plan,
                                boolean isValid,
                                List<String> validationErrors,
                                List<V1ConfirmPriority> priorities) {
}
