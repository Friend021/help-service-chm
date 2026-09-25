package ru.cft.kompas.security;

/** Контекст сотрудника, пришедший из заглушки «ПЛАН РАЗВИТИЯ» (claims токена входа). */
public record EntryContext(String employeeExternalId,
                           String fullName,
                           String currentPosition,
                           String targetRole,
                           String careerTrack,
                           String managerFullName,
                           String managerExternalId) {
}
