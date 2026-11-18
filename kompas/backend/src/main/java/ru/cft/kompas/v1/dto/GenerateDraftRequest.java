package ru.cft.kompas.v1.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import java.util.List;

/**
 * Тело POST /api/v1/chat/generate-draft.
 *
 * @param ratings       самооценка по компетенциям целевой роли
 * @param plannedTasks  свободный текст: какие рабочие задачи сотрудник планирует выполнять,
 *                      чтобы развиваться (опционально) — подмешивается в промпт генерации ИПР
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public record GenerateDraftRequest(List<Rating> ratings, String plannedTasks) {
}
