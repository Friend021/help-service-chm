package ru.cft.kompas.security;

import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Date;
import javax.crypto.SecretKey;
import org.springframework.stereotype.Component;
import ru.cft.kompas.config.KompasProperties;

/**
 * Токен доступа к API «Компаса». Выдаётся в обмен на токен входа при создании сессии,
 * чтобы короткий TTL токена входа не ограничивал работу с чатом.
 */
@Component
public class AccessTokenService {

    private final SecretKey key;
    private final KompasProperties.Security config;

    public AccessTokenService(KompasProperties properties) {
        this.config = properties.getSecurity();
        this.key = Keys.hmacShaKeyFor(config.getJwtSecret().getBytes(StandardCharsets.UTF_8));
    }

    public String issue(Long sessionId, Long employeeId) {
        Instant now = Instant.now();
        return Jwts.builder()
                .issuer("kompas")
                .subject(String.valueOf(employeeId))
                .claim("sid", sessionId)
                .claim("eid", employeeId)
                .issuedAt(Date.from(now))
                .expiration(Date.from(now.plus(config.getAccessTokenTtl())))
                .signWith(key)
                .compact();
    }

    public SessionPrincipal verify(String token) {
        if (token == null || token.isBlank()) {
            throw new InvalidTokenException("Требуется токен доступа");
        }
        try {
            var claims = Jwts.parser()
                    .verifyWith(key)
                    .build()
                    .parseSignedClaims(token)
                    .getPayload();
            return new SessionPrincipal(
                    claims.get("sid", Number.class).longValue(),
                    claims.get("eid", Number.class).longValue());
        } catch (JwtException | IllegalArgumentException | NullPointerException e) {
            throw new InvalidTokenException("Сессия истекла. Откройте «Компас» заново из «ПЛАНА РАЗВИТИЯ».", e);
        }
    }
}
