package ru.cft.kompas.v1.dto;

/** Строка сводки приоритетов в ответе confirm: направление, ранг и его подпись. */
public record V1ConfirmPriority(String goal, int rank, String label) {
}
