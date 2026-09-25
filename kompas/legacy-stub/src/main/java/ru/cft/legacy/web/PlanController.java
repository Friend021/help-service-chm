package ru.cft.legacy.web;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.servlet.view.RedirectView;
import ru.cft.legacy.LegacyProperties;
import ru.cft.legacy.model.DemoEmployee;
import ru.cft.legacy.model.ImportedPlan;

@Controller
public class PlanController {

    private static final Logger log = LoggerFactory.getLogger(PlanController.class);
    private static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("dd.MM.yyyy");

    private final LegacyProperties properties;
    private final EntryTokenIssuer tokenIssuer;
    private final HandoverTokenVerifier handoverVerifier;

    public PlanController(LegacyProperties properties,
                          EntryTokenIssuer tokenIssuer,
                          HandoverTokenVerifier handoverVerifier) {
        this.properties = properties;
        this.tokenIssuer = tokenIssuer;
        this.handoverVerifier = handoverVerifier;
    }

    @GetMapping("/")
    public String plan(@RequestParam(name = "employee", required = false) String externalId, Model model) {
        DemoEmployee employee = resolve(externalId);
        model.addAttribute("employees", properties.getEmployees());
        model.addAttribute("goalCategories", properties.getGoalCategories());
        model.addAttribute("instruments", properties.getInstruments());
        model.addAttribute("employee", employee);
        model.addAttribute("today", LocalDate.now().format(DATE));
        return "plan";
    }

    /**
     * Возврат из «Компаса»: форма открывается уже заполненной приоритетами,
     * которые сотрудник собрал в диалоге.
     */
    @GetMapping("/import")
    public String importPlan(@RequestParam(name = "token", required = false) String token, Model model) {
        ImportedPlan plan;
        try {
            plan = handoverVerifier.verify(token);
        } catch (IllegalArgumentException e) {
            model.addAttribute("employees", properties.getEmployees());
        model.addAttribute("goalCategories", properties.getGoalCategories());
        model.addAttribute("instruments", properties.getInstruments());
            model.addAttribute("employee", resolve(null));
            model.addAttribute("today", LocalDate.now().format(DATE));
            model.addAttribute("importError", e.getMessage());
            return "plan";
        }

        log.info("Принят план из «Компаса»: сотрудник {}, приоритетов {}",
                plan.employeeExternalId(), plan.rows().size());

        model.addAttribute("employees", properties.getEmployees());
        model.addAttribute("goalCategories", properties.getGoalCategories());
        model.addAttribute("instruments", properties.getInstruments());
        model.addAttribute("employee", resolve(plan.employeeExternalId()));
        model.addAttribute("today", plan.date() == null
                ? LocalDate.now().format(DATE)
                : LocalDate.parse(plan.date()).format(DATE));
        model.addAttribute("imported", plan);
        return "plan";
    }

    /** Кнопка «Сформировать с помощью Компаса»: выдаём токен и уходим в «Компас». */
    @GetMapping("/kompas")
    public RedirectView toKompas(@RequestParam(name = "employee", required = false) String externalId) {
        DemoEmployee employee = resolve(externalId);
        String token = tokenIssuer.issue(employee);
        String target = properties.getKompasFrontendUrl() + "/entry?token="
                + URLEncoder.encode(token, StandardCharsets.UTF_8);
        log.info("Переход в «Компас» для сотрудника {}", employee.getExternalId());
        return new RedirectView(target);
    }

    private DemoEmployee resolve(String externalId) {
        if (properties.getEmployees().isEmpty()) {
            throw new IllegalStateException("Не заданы демо-сотрудники (demo-employees.yml)");
        }
        return properties.getEmployees().stream()
                .filter(e -> e.getExternalId().equals(externalId))
                .findFirst()
                .orElse(properties.getEmployees().get(0));
    }
}
