package ru.cft.kompas.v1.dto;

import java.util.List;

/**
 * Профиль должности для карточки «текущая должность»: орг-путь (крошки)
 * и ключевые функции из профиля.
 */
public record V1PositionProfile(String title,
                                String careerTrack,
                                String orgBlock,
                                String orgDirection,
                                List<String> keyFunctions) {
}
