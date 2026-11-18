package ru.cft.kompas.v1.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import java.util.List;

/** Модель плана фронта: ключевая цель и направления развития. */
@JsonIgnoreProperties(ignoreUnknown = true)
public record V1Plan(String mainGoal, List<V1Direction> directions) {
}
