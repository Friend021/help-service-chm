package ru.cft.legacy.web;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import javax.crypto.SecretKey;
import org.springframework.stereotype.Component;
import ru.cft.legacy.LegacyProperties;
import ru.cft.legacy.model.ImportedPlan;

/**
 * Приём плана, возвращённого из «Компаса». Обратная сторона EntryTokenIssuer:
 * тот же общий секрет, та же проверка подписи и срока.
 */
@Component
public class HandoverTokenVerifier {

    private final SecretKey key;

    public HandoverTokenVerifier(LegacyProperties properties) {
        this.key = Keys.hmacShaKeyFor(properties.getJwtSecret().getBytes(StandardCharsets.UTF_8));
    }

    @SuppressWarnings("unchecked")
    public ImportedPlan verify(String token) {
        if (token == null || token.isBlank()) {
            throw new IllegalArgumentException("Не передан токен переноса плана");
        }
        try {
            Claims claims = Jwts.parser()
                    .verifyWith(key)
                    .build()
                    .parseSignedClaims(token)
                    .getPayload();

            List<Map<String, Object>> raw = claims.get("priorities", List.class);

            return new ImportedPlan(
                    claims.get("employeeExternalId", String.class),
                    claims.get("employeeName", String.class),
                    claims.get("managerName", String.class),
                    claims.get("currentPosition", String.class),
                    claims.get("targetRole", String.class),
                    claims.get("date", String.class),
                    ImportedPlan.rows(raw));
        } catch (JwtException | IllegalArgumentException e) {
            throw new IllegalArgumentException(
                    "Ссылка переноса недействительна или истекла. Вернитесь в «Компас» и повторите.", e);
        }
    }
}
