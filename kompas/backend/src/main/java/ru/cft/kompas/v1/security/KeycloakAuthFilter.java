package ru.cft.kompas.v1.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Авторизация нового слоя /api/v1 по RS256-токену Keycloak.
 * Легаси-фильтр эти пути пропускает (shouldNotFilter). При успехе кладёт
 * KeycloakPrincipal в атрибут запроса; при ошибке — 401 в той же JSON-форме,
 * что и легаси-фильтр ({"error": "..."}).
 */
public class KeycloakAuthFilter extends OncePerRequestFilter {

    private final KeycloakJwtVerifier verifier;

    public KeycloakAuthFilter(KeycloakJwtVerifier verifier) {
        this.verifier = verifier;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        if ("OPTIONS".equalsIgnoreCase(request.getMethod())) {
            return true;
        }
        return !request.getRequestURI().startsWith("/api/v1/");
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain chain) throws ServletException, IOException {
        String header = request.getHeader(HttpHeaders.AUTHORIZATION);
        String token = header != null && header.startsWith("Bearer ") ? header.substring(7) : null;

        try {
            KeycloakPrincipal principal = verifier.verify(token);
            request.setAttribute(KeycloakPrincipal.ATTRIBUTE, principal);
        } catch (KeycloakAuthException e) {
            response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
            response.setContentType(MediaType.APPLICATION_JSON_VALUE);
            response.setCharacterEncoding(StandardCharsets.UTF_8.name());
            response.getWriter().write("{\"error\":\"" + e.getMessage().replace("\"", "'") + "\"}");
            return;
        }

        chain.doFilter(request, response);
    }
}
