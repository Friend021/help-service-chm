package ru.cft.legacy.web;

import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Date;
import javax.crypto.SecretKey;
import org.springframework.stereotype.Component;
import ru.cft.legacy.LegacyProperties;
import ru.cft.legacy.model.DemoEmployee;

/**
 * Выдаёт подписанный HMAC-ом токен входа в «Компас».
 * Состав claims зафиксирован в /docs/integration.md.
 */
@Component
public class EntryTokenIssuer {

    private final LegacyProperties properties;

    public EntryTokenIssuer(LegacyProperties properties) {
        this.properties = properties;
    }

    public String issue(DemoEmployee employee) {
        Instant now = Instant.now();
        SecretKey key = Keys.hmacShaKeyFor(properties.getJwtSecret().getBytes(StandardCharsets.UTF_8));

        return Jwts.builder()
                .issuer("legacy-plan-razvitiya")
                .subject(employee.getExternalId())
                .claim("employeeExternalId", employee.getExternalId())
                .claim("fullName", employee.getFullName())
                .claim("currentPosition", employee.getCurrentPosition())
                .claim("targetRole", employee.getTargetRole())
                .claim("careerTrack", employee.getCareerTrack())
                .claim("managerFullName", employee.getManagerFullName())
                .claim("managerExternalId", employee.getManagerExternalId())
                .issuedAt(Date.from(now))
                .expiration(Date.from(now.plus(properties.getJwtTtl())))
                .signWith(key)
                .compact();
    }
}
