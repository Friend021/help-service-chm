package ru.cft.kompas.v1.security;

import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.jwk.source.JWKSource;
import com.nimbusds.jose.jwk.source.JWKSourceBuilder;
import com.nimbusds.jose.proc.JWSVerificationKeySelector;
import com.nimbusds.jose.proc.SecurityContext;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.proc.DefaultJWTClaimsVerifier;
import com.nimbusds.jwt.proc.DefaultJWTProcessor;
import java.net.MalformedURLException;
import java.net.URI;
import java.net.URL;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.stereotype.Component;
import ru.cft.kompas.config.KompasProperties;

/**
 * Проверка RS256-токенов Keycloak для /api/v1.
 *
 * Подпись проверяется по JWKS (RemoteJWKSet сам рефетчит ключи при неизвестном kid,
 * поэтому рестарт mock-Keycloak с новыми ключами не ломает проверку). Дополнительно
 * сверяются издатель, срок действия (с допуском на расхождение часов) и клиент —
 * он принимается в aud ИЛИ azp (mock кладёт clientId в aud).
 */
@Component
public class KeycloakJwtVerifier {

    private final DefaultJWTProcessor<SecurityContext> processor;
    private final String issuerUri;
    private final String audience;

    public KeycloakJwtVerifier(KompasProperties properties) {
        KompasProperties.Keycloak config = properties.getKeycloak();
        this.issuerUri = config.getIssuerUri();
        this.audience = config.getAudience();

        JWKSource<SecurityContext> jwkSource =
                JWKSourceBuilder.<SecurityContext>create(toUrl(config.getJwksUri())).build();
        this.processor = new DefaultJWTProcessor<>();
        this.processor.setJWSKeySelector(new JWSVerificationKeySelector<>(JWSAlgorithm.RS256, jwkSource));

        DefaultJWTClaimsVerifier<SecurityContext> claimsVerifier = new DefaultJWTClaimsVerifier<>(
                new JWTClaimsSet.Builder().issuer(issuerUri).build(),
                Set.of("sub", "exp"));
        claimsVerifier.setMaxClockSkew((int) config.getClockSkewSeconds());
        this.processor.setJWTClaimsSetVerifier(claimsVerifier);
    }

    /** @return проверенный пользователь; бросает KeycloakAuthException при любой проблеме */
    public KeycloakPrincipal verify(String token) {
        if (token == null || token.isBlank()) {
            throw new KeycloakAuthException("Требуется токен доступа Keycloak");
        }

        JWTClaimsSet claims;
        try {
            claims = processor.process(token, null);
        } catch (Exception e) {
            throw new KeycloakAuthException("Токен недействителен или истёк", e);
        }

        if (!clientMatches(claims)) {
            throw new KeycloakAuthException("Токен выписан для другого клиента");
        }

        String sub = claims.getSubject();
        if (sub == null || sub.isBlank()) {
            throw new KeycloakAuthException("В токене нет субъекта (sub)");
        }

        String name = firstNonBlank(stringClaim(claims, "name"),
                stringClaim(claims, "preferred_username"), "Сотрудник");
        String email = stringClaim(claims, "email");
        return new KeycloakPrincipal(sub, name, email, realmRoles(claims));
    }

    /** Клиент принимается в aud ИЛИ azp. */
    private boolean clientMatches(JWTClaimsSet claims) {
        List<String> audiences = claims.getAudience();
        if (audiences != null && audiences.contains(audience)) {
            return true;
        }
        return audience.equals(stringClaim(claims, "azp"));
    }

    @SuppressWarnings("unchecked")
    private static List<String> realmRoles(JWTClaimsSet claims) {
        List<String> roles = new ArrayList<>();
        Object realmAccess = claims.getClaim("realm_access");
        if (realmAccess instanceof Map<?, ?> map && map.get("roles") instanceof List<?> list) {
            for (Object role : list) {
                if (role != null) {
                    roles.add(String.valueOf(role));
                }
            }
        }
        return roles;
    }

    private static String stringClaim(JWTClaimsSet claims, String name) {
        try {
            return claims.getStringClaim(name);
        } catch (Exception e) {
            return null;
        }
    }

    private static String firstNonBlank(String... values) {
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return value;
            }
        }
        return null;
    }

    private static URL toUrl(String jwksUri) {
        try {
            return URI.create(jwksUri).toURL();
        } catch (MalformedURLException | IllegalArgumentException e) {
            throw new IllegalStateException("Некорректный kompas.keycloak.jwks-uri: " + jwksUri, e);
        }
    }
}
