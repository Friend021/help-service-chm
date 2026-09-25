package ru.cft.kompas.api.dto;

import java.util.List;
import ru.cft.kompas.export.IdpView;

/** Полное состояние сессии для SPA. */
public record SessionResponse(Long sessionId,
                              String accessToken,
                              StageDto stage,
                              String status,
                              EmployeeDto employee,
                              List<MessageDto> messages,
                              IdpView idp) {

    public record EmployeeDto(String externalId,
                              String fullName,
                              String currentPosition,
                              String targetRole,
                              String managerFullName) {
    }
}
