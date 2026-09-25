package ru.cft.legacy;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;
import ru.cft.legacy.model.DemoEmployee;

@ConfigurationProperties(prefix = "legacy")
public class LegacyProperties {

    /** Общий с «Компасом» HMAC-секрет для подписи токена входа. */
    private String jwtSecret;

    /** Время жизни токена входа. */
    private Duration jwtTtl = Duration.ofMinutes(10);

    /** Базовый URL SPA «Компаса», куда уходит redirect. */
    private String kompasFrontendUrl = "http://localhost:4200";

    /** Предзаданные демо-сотрудники (demo-employees.yml). */
    private List<DemoEmployee> employees = new ArrayList<>();

    /** Значения выпадающего списка «Цели по развитию». */
    private List<String> goalCategories = new ArrayList<>();

    public String getJwtSecret() {
        return jwtSecret;
    }

    public void setJwtSecret(String jwtSecret) {
        this.jwtSecret = jwtSecret;
    }

    public Duration getJwtTtl() {
        return jwtTtl;
    }

    public void setJwtTtl(Duration jwtTtl) {
        this.jwtTtl = jwtTtl;
    }

    public String getKompasFrontendUrl() {
        return kompasFrontendUrl;
    }

    public void setKompasFrontendUrl(String kompasFrontendUrl) {
        this.kompasFrontendUrl = kompasFrontendUrl;
    }

    public List<DemoEmployee> getEmployees() {
        return employees;
    }

    public void setEmployees(List<DemoEmployee> employees) {
        this.employees = employees;
    }

    public List<String> getGoalCategories() {
        return goalCategories;
    }

    public void setGoalCategories(List<String> goalCategories) {
        this.goalCategories = goalCategories;
    }
}
