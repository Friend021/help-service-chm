package ru.cft.kompas.v1.api;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import ru.cft.kompas.security.EntryContext;
import ru.cft.kompas.security.JwtEntryTokenVerifier;
import ru.cft.kompas.v1.dto.V1EntryRequest;
import ru.cft.kompas.v1.dto.V1ManualContextRequest;
import ru.cft.kompas.v1.dto.V1ManualContextResponse;
import ru.cft.kompas.v1.dto.V1SessionContextResponse;
import ru.cft.kompas.v1.security.KeycloakPrincipal;
import ru.cft.kompas.v1.service.V1SessionService;

/** Контекст сессии нового фронта. Формы ответов — как в mock /session/context и /context/manual. */
@RestController
@RequestMapping("/api/v1/session")
public class V1SessionController {

    private final V1SessionService service;
    private final JwtEntryTokenVerifier entryTokenVerifier;

    public V1SessionController(V1SessionService service, JwtEntryTokenVerifier entryTokenVerifier) {
        this.service = service;
        this.entryTokenVerifier = entryTokenVerifier;
    }

    @GetMapping("/context")
    public V1SessionContextResponse context(@RequestParam(required = false) String scenario,
                                            HttpServletRequest request) {
        V1SessionService.ContextView view = service.resolve(principal(request), scenario);
        return toContextResponse(view);
    }

    /**
     * Вход из «ПЛАН РАЗВИТИЯ» через авторизованный Keycloak-слой: проверяем HS256-токен
     * входа, наполняем контекст сессии принципала данными из токена и отдаём ту же форму,
     * что и GET /context.
     */
    @PostMapping("/entry")
    public V1SessionContextResponse entry(@Valid @RequestBody V1EntryRequest body,
                                          HttpServletRequest request) {
        EntryContext ctx = entryTokenVerifier.verify(body.token());
        V1SessionService.ContextView view = service.applyEntry(principal(request), ctx);
        return toContextResponse(view);
    }

    private static V1SessionContextResponse toContextResponse(V1SessionService.ContextView view) {
        return new V1SessionContextResponse(
                view.context(),
                view.scenario(),
                view.stage().name(),
                view.context().isNewEmployee(),
                view.context().returnUrl());
    }

    @PostMapping("/context/manual")
    public V1ManualContextResponse manual(@RequestBody V1ManualContextRequest body,
                                          HttpServletRequest request) {
        if (body == null || isBlank(body.currentPosition()) || isBlank(body.targetPosition())) {
            throw new IllegalArgumentException("Проверьте текущую и целевую должность");
        }
        V1SessionService.ContextView view = service.applyManualContext(
                principal(request), body.currentPosition().trim(), body.targetPosition().trim());
        return new V1ManualContextResponse(view.context(), view.stage().name());
    }

    private static KeycloakPrincipal principal(HttpServletRequest request) {
        return (KeycloakPrincipal) request.getAttribute(KeycloakPrincipal.ATTRIBUTE);
    }

    private static boolean isBlank(String value) {
        return value == null || value.trim().isEmpty();
    }
}
