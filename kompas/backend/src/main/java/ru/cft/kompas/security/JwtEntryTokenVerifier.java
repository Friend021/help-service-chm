package ru.cft.kompas.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import java.nio.charset.StandardCharsets;
import javax.crypto.SecretKey;
import org.springframework.stereotype.Component;
import ru.cft.kompas.config.KompasProperties;

@Component
public class JwtEntryTokenVerifier implements EntryTokenVerifier {

    private final SecretKey key;

    public JwtEntryTokenVerifier(KompasProperties properties) {
        String secret = properties.getSecurity().getJwtSecret();
        if (secret == null || secret.getBytes(StandardCharsets.UTF_8).length < 32) {
            throw new IllegalStateException(
                    "kompas.security.jwt-secret должен быть не короче 32 байт (см. .env / JWT_SECRET)");
        }
        this.key = Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
    }

    @Override
    public EntryContext verify(String token) {
        if (token == null || token.isBlank()) {
            throw new InvalidTokenException("Токен входа не передан");
        }
        try {
            Claims claims = Jwts.parser()
                    .verifyWith(key)
                    .build()
                    .parseSignedClaims(token)
                    .getPayload();

            String externalId = claims.get("employeeExternalId", String.class);
            if (externalId == null || externalId.isBlank()) {
                throw new InvalidTokenException("В токене входа нет employeeExternalId");
            }

            return new EntryContext(
                    externalId,
                    claims.get("fullName", String.class),
                    claims.get("currentPosition", String.class),
                    claims.get("targetRole", String.class),
                    claims.get("careerTrack", String.class),
                    claims.get("managerFullName", String.class),
                    claims.get("managerExternalId", String.class));
        } catch (JwtException | IllegalArgumentException e) {
            throw new InvalidTokenException(
                    "Токен входа недействителен или истёк. Вернитесь в «ПЛАН РАЗВИТИЯ» и повторите переход.", e);
        }
    }
}
