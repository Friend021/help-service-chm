package ru.cft.kompas.reference;

import java.util.List;

/** Структура файла seed/reference-data.yml. */
public record SeedData(List<SeedPosition> positions,
                       List<SeedCompetency> competencies,
                       List<SeedActivity> activities) {

    public record SeedPosition(String title, String type, String careerTrack, String jobDescriptionRef) {
    }

    public record SeedCompetency(String code, String name, String role, Integer targetLevel, String description) {
    }

    public record SeedActivity(String code, String title, String type, String sourceRef,
                               List<String> competencies, String description) {
    }
}
