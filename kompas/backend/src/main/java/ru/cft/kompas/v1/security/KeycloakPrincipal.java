package ru.cft.kompas.v1.security;

import java.util.List;

/**
 * Проверенный пользователь Keycloak для слоя /api/v1.
 * Кладётся фильтром в атрибут запроса, читается контроллерами.
 */
public record KeycloakPrincipal(String sub, String name, String email, List<String> roles) {

    public static final String ATTRIBUTE = KeycloakPrincipal.class.getName();
}
