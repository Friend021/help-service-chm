package ru.cft.kompas.v1.dto;

import java.util.List;

/** Ответ GET /api/v1/idp/dictionaries. */
public record V1Dictionaries(List<String> directions,
                             List<V1PriorityOption> priorities,
                             List<String> developmentTools,
                             List<V1StageInfo> stages,
                             List<String> targetRoles,
                             List<V1TargetPosition> targetPositions) {
}
