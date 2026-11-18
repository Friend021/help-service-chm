package ru.cft.kompas.v1.dto;

/** Строка справочника стадий мастера. */
public record V1StageInfo(String stage, int stepNumber, String label, int totalSteps) {
}
