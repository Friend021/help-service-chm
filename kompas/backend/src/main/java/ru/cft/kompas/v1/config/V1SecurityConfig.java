package ru.cft.kompas.v1.config;

import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import ru.cft.kompas.v1.security.KeycloakAuthFilter;
import ru.cft.kompas.v1.security.KeycloakJwtVerifier;

/** Регистрация Keycloak-фильтра на /api/v1/*. */
@Configuration
public class V1SecurityConfig {

    @Bean
    public FilterRegistrationBean<KeycloakAuthFilter> keycloakAuthFilter(KeycloakJwtVerifier verifier) {
        FilterRegistrationBean<KeycloakAuthFilter> registration =
                new FilterRegistrationBean<>(new KeycloakAuthFilter(verifier));
        registration.addUrlPatterns("/api/v1/*");
        registration.setOrder(0);
        // Обязательно для будущего SSE: иначе асинхронный ответ зависает на фильтре.
        registration.setAsyncSupported(true);
        return registration;
    }
}
