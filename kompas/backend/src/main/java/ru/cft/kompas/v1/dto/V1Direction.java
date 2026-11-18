package ru.cft.kompas.v1.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import java.util.List;

/**
 * Направление развития: приоритет (rank), цель, описание, коды развиваемых
 * компетенций целевой роли (для трассируемости ИПР) и задачи.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public record V1Direction(int rank, String goal, String description,
                          List<String> competencyCodes, List<V1Task> tasks) {
}
