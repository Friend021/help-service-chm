package ru.cft.kompas.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Date;
import javax.crypto.SecretKey;
import org.junit.jupiter.api.Test;
import ru.cft.kompas.config.KompasProperties;

class JwtEntryTokenVerifierTest {

    private static final String SECRET = "kompas-test-secret-0123456789-0123456789";

    private final JwtEntryTokenVerifier verifier = new JwtEntryTokenVerifier(properties(SECRET));

    @Test
    void принимает_корректный_токен_и_отдаёт_контекст() {
        String token = issue(SECRET, Instant.now().plusSeconds(600));

        EntryContext context = verifier.verify(token);

        assertThat(context.employeeExternalId()).isEqualTo("emp-001");
        assertThat(context.fullName()).isEqualTo("Соколова Анна Дмитриевна");
        assertThat(context.currentPosition()).isEqualTo("Разработчик Java");
        assertThat(context.targetRole()).isEqualTo("Ведущий разработчик Java");
        assertThat(context.managerExternalId()).isEqualTo("mgr-001");
    }

    @Test
    void отклоняет_токен_с_чужой_подписью() {
        String token = issue("другой-секрет-который-тоже-достаточно-длинный", Instant.now().plusSeconds(600));

        assertThatThrownBy(() -> verifier.verify(token)).isInstanceOf(InvalidTokenException.class);
    }

    @Test
    void отклоняет_протухший_токен() {
        String token = issue(SECRET, Instant.now().minusSeconds(60));

        assertThatThrownBy(() -> verifier.verify(token)).isInstanceOf(InvalidTokenException.class);
    }

    @Test
    void отклоняет_пустой_токен() {
        assertThatThrownBy(() -> verifier.verify(null)).isInstanceOf(InvalidTokenException.class);
    }

    @Test
    void короткий_секрет_не_принимается_при_старте() {
        assertThatThrownBy(() -> new JwtEntryTokenVerifier(properties("короткий")))
                .isInstanceOf(IllegalStateException.class);
    }

    private static String issue(String secret, Instant expiration) {
        SecretKey key = Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
        return Jwts.builder()
                .subject("emp-001")
                .claim("employeeExternalId", "emp-001")
                .claim("fullName", "Соколова Анна Дмитриевна")
                .claim("currentPosition", "Разработчик Java")
                .claim("targetRole", "Ведущий разработчик Java")
                .claim("careerTrack", "Разработка ПО")
                .claim("managerFullName", "Верещагин Олег Борисович")
                .claim("managerExternalId", "mgr-001")
                .issuedAt(Date.from(Instant.now().minusSeconds(120)))
                .expiration(Date.from(expiration))
                .signWith(key)
                .compact();
    }

    private static KompasProperties properties(String secret) {
        KompasProperties properties = new KompasProperties();
        properties.getSecurity().setJwtSecret(secret);
        return properties;
    }
}
