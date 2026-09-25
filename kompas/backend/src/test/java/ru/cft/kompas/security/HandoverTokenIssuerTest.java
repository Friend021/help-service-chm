package ru.cft.kompas.security;

import static org.assertj.core.api.Assertions.assertThat;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import ru.cft.kompas.config.KompasProperties;
import ru.cft.kompas.export.IdpView;

class HandoverTokenIssuerTest {

    private static final String SECRET = "kompas-test-secret-0123456789-0123456789";

    private final HandoverTokenIssuer issuer = new HandoverTokenIssuer(properties());

    @Test
    void ссылка_ведёт_на_форму_и_несёт_подписанный_план() {
        String url = issuer.issueUrl(view());

        assertThat(url).startsWith("http://legacy.test/import?token=");
        Claims claims = parse(url);
        assertThat(claims.get("employeeExternalId", String.class)).isEqualTo("emp-002");
        assertThat(claims.get("employeeName", String.class)).isEqualTo("Ковалёв Артём Сергеевич");
        assertThat(claims.get("targetRole", String.class)).isEqualTo("Архитектор решений");
        assertThat(claims.get("date", String.class)).isEqualTo("2026-09-25");
    }

    @Test
    void приоритеты_разложены_по_колонкам_формы_и_отсортированы() {
        Claims claims = parse(issuer.issueUrl(view()));

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> rows = claims.get("priorities", List.class);

        assertThat(rows).hasSize(2);
        // В IdpView порядок перепутан — на выходе должен быть по номеру приоритета
        assertThat(rows.get(0).get("order")).isEqualTo(1);
        assertThat(rows.get(0).get("goal")).isEqualTo("Первая цель");
        assertThat(rows.get(0).get("competencies")).isEqualTo("Нефункциональные требования");
        assertThat(rows.get(0).get("activities")).isEqualTo("Нагрузочное тестирование");

        assertThat(rows.get(1).get("order")).isEqualTo(2);
        assertThat(rows.get(1).get("competencies"))
                .isEqualTo("Влияние и переговоры; Архитектура прикладных решений");
    }

    @Test
    void план_без_активностей_переносится_с_пустой_колонкой() {
        IdpView bare = new IdpView(7L, LocalDate.of(2026, 9, 25), "DRAFT", "emp-001", "Сотрудник",
                "Руководитель", "Разработчик Java", "Ведущий разработчик Java",
                List.of(new IdpView.PriorityView(1, "Цель", List.of(), List.of(), List.of())));

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> rows = parse(issuer.issueUrl(bare)).get("priorities", List.class);

        assertThat(rows.get(0).get("activities")).isEqualTo("");
    }

    private Claims parse(String url) {
        String query = URI.create(url).getQuery();
        String token = URLDecoder.decode(query.substring("token=".length()), StandardCharsets.UTF_8);
        return Jwts.parser()
                .verifyWith(Keys.hmacShaKeyFor(SECRET.getBytes(StandardCharsets.UTF_8)))
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }

    private static IdpView view() {
        return new IdpView(42L, LocalDate.of(2026, 9, 25), "DRAFT", "emp-002",
                "Ковалёв Артём Сергеевич", "Верещагин Олег Борисович",
                "Ведущий разработчик Java", "Архитектор решений",
                List.of(
                        new IdpView.PriorityView(2, "Вторая цель",
                                List.of(new IdpView.NamedRef("ARC-06", "Влияние и переговоры", null),
                                        new IdpView.NamedRef("ARC-01", "Архитектура прикладных решений", null)),
                                List.of(), List.of()),
                        new IdpView.PriorityView(1, "Первая цель",
                                List.of(new IdpView.NamedRef("ARC-03", "Нефункциональные требования", null)),
                                List.of(new IdpView.NamedRef("ACT-017", "Нагрузочное тестирование", null)),
                                List.of())));
    }

    private static KompasProperties properties() {
        KompasProperties properties = new KompasProperties();
        properties.getSecurity().setJwtSecret(SECRET);
        properties.getLegacy().setImportUrl("http://legacy.test/import");
        return properties;
    }
}
