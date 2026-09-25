package ru.cft.kompas.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record MessageRequest(@NotBlank(message = "Сообщение не может быть пустым")
                             @Size(max = 4000, message = "Сообщение слишком длинное")
                             String text) {
}
