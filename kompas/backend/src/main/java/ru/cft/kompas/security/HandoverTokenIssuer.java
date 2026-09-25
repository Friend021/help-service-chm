package ru.cft.kompas.security;

import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.Date;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import javax.crypto.SecretKey;
import org.springframework.stereotype.Component;
import ru.cft.kompas.config.KompasProperties;
import ru.cft.kompas.export.IdpView;

/**
 * Обратная передача готового плана в сервис «ПЛАН РАЗВИТИЯ».
 *
 * Схема зеркалит вход: тот же общий HMAC-секрет, короткий TTL, передача через
 * подписанный токен в ссылке. Серверного вызова между сервисами нет — сотрудник
 * сам уходит по ссылке и видит заполненную форму.
 */
@Component
public class HandoverTokenIssuer {

    private final SecretKey key;
    private final KompasProperties.Legacy config;

    public HandoverTokenIssuer(KompasProperties properties) {
        this.config = properties.getLegacy();
        this.key = Keys.hmacShaKeyFor(
                properties.getSecurity().getJwtSecret().getBytes(StandardCharsets.UTF_8));
    }

    /** @return ссылка на форму старого сервиса с подписанным планом */
    public String issueUrl(IdpView view) {
        Instant now = Instant.now();

        String token = Jwts.builder()
                .issuer("kompas")
                .subject(String.valueOf(view.id()))
                .claim("employeeExternalId", view.employeeExternalId())
                .claim("employeeName", view.employeeName())
                .claim("managerName", view.managerName())
                .claim("currentPosition", view.currentPosition())
                .claim("targetRole", view.targetRole())
                .claim("date", view.date() == null ? null : view.date().toString())
                .claim("priorities", rows(view))
                .issuedAt(Date.from(now))
                .expiration(Date.from(now.plus(config.getHandoverTtl())))
                .signWith(key)
                .compact();

        return config.getImportUrl() + "?token=" + URLEncoder.encode(token, StandardCharsets.UTF_8);
    }

    /**
     * Раскладка под колонки формы.
     *
     * «Цели по развитию» — выпадающий список, туда идёт только категория из его
     * справочника. Вся содержательная часть (компетенции, сама цель по SMART,
     * активности) ложится в свободную колонку «Что развиваем?».
     * Порядок строк — по номеру приоритета, как в самой форме.
     */
    private List<Map<String, Object>> rows(IdpView view) {
        List<IdpView.PriorityView> sorted = new ArrayList<>(view.priorities());
        sorted.sort(Comparator.comparing(
                IdpView.PriorityView::order, Comparator.nullsLast(Comparator.naturalOrder())));

        List<Map<String, Object>> rows = new ArrayList<>();
        int order = 1;
        for (IdpView.PriorityView priority : sorted) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("order", priority.order() == null ? order : priority.order());
            row.put("category", priority.goalCategory());
            row.put("goal", priority.developmentGoal());
            row.put("competencies", join(priority.competencies()));
            row.put("actions", actions(priority));
            rows.add(row);
            order++;
        }
        return rows;
    }

    /** Строки таблицы «как развиваем» под целью — колонки формы один в один. */
    private static List<Map<String, Object>> actions(IdpView.PriorityView priority) {
        List<Map<String, Object>> actions = new ArrayList<>();
        int number = 1;
        for (IdpView.ActionView action : priority.actions()) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("number", number++);
            row.put("instrument", action.instrument());
            row.put("action", action.activityName() == null
                    ? action.action()
                    : action.action() + " — " + action.activityName());
            row.put("dueDate", action.dueDate() == null ? "" : action.dueDate());
            row.put("status", action.status());
            actions.add(row);
        }
        return actions;
    }

    private static String join(List<IdpView.NamedRef> refs) {
        return refs.stream().map(IdpView.NamedRef::name).reduce((a, b) -> a + "; " + b).orElse("");
    }
}
