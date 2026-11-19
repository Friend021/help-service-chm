package ru.cft.kompas.v1.dto;

/**
 * Целевая должность с орг-путём для дерева выбора на шаге подтверждения:
 * Блок → Дирекция → семейство (careerTrack) → грейд (title).
 */
public record V1TargetPosition(String title,
                               String careerTrack,
                               String orgBlock,
                               String orgDirection) {
}
