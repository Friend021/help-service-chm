package ru.cft.kompas.v1.dto;

/** Контекст сотрудника — поля один в один с mock EmployeeContext. */
public record V1EmployeeContext(String employeeId,
                                String fullName,
                                String managerFullName,
                                boolean hasActiveIdpWarning,
                                String currentPosition,
                                String targetPosition,
                                String returnUrl,
                                boolean isNewEmployee) {
}
