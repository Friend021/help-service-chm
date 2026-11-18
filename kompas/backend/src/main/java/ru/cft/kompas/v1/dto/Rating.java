package ru.cft.kompas.v1.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

/** Самооценка по одному навыку: skillId — код компетенции, rating 1..5. */
@JsonIgnoreProperties(ignoreUnknown = true)
public record Rating(String skillId, Integer rating) {
}
