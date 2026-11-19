package ru.cft.kompas.v1.api;

import jakarta.servlet.http.HttpServletRequest;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import ru.cft.kompas.reference.JobProfileParser;
import ru.cft.kompas.domain.DevelopmentInstrument;
import ru.cft.kompas.domain.Idp;
import ru.cft.kompas.domain.JobPosition;
import ru.cft.kompas.domain.PositionType;
import ru.cft.kompas.reference.GoalCategoryCatalog;
import ru.cft.kompas.repo.JobPositionRepository;
import ru.cft.kompas.v1.WorkflowStage;
import ru.cft.kompas.v1.dto.V1Dictionaries;
import ru.cft.kompas.v1.dto.V1DraftResponse;
import ru.cft.kompas.v1.dto.V1ExportResponse;
import ru.cft.kompas.v1.dto.V1Plan;
import ru.cft.kompas.v1.dto.V1PlanEnvelope;
import ru.cft.kompas.v1.dto.V1PlanError;
import ru.cft.kompas.v1.dto.V1PriorityOption;
import ru.cft.kompas.v1.dto.V1PositionProfile;
import ru.cft.kompas.v1.dto.V1StageInfo;
import ru.cft.kompas.v1.dto.V1TargetPosition;
import ru.cft.kompas.v1.mapping.PlanMapper;
import ru.cft.kompas.v1.mapping.PlanValidator;
import ru.cft.kompas.v1.security.KeycloakPrincipal;
import ru.cft.kompas.v1.service.V1SessionService;

/** Справочники и черновик ИПР нового фронта. Формы ответов — как в mock /idp/*. */
@RestController
@RequestMapping("/api/v1/idp")
public class V1IdpController {

    private final V1SessionService sessionService;
    private final PlanMapper planMapper;
    private final PlanValidator planValidator;
    private final GoalCategoryCatalog goalCategories;
    private final JobPositionRepository jobPositions;

    public V1IdpController(V1SessionService sessionService,
                           PlanMapper planMapper,
                           PlanValidator planValidator,
                           GoalCategoryCatalog goalCategories,
                           JobPositionRepository jobPositions) {
        this.sessionService = sessionService;
        this.planMapper = planMapper;
        this.planValidator = planValidator;
        this.goalCategories = goalCategories;
        this.jobPositions = jobPositions;
    }

    @GetMapping("/dictionaries")
    public V1Dictionaries dictionaries() {
        List<V1PriorityOption> priorities = List.of(
                new V1PriorityOption(0, "Высокий"),
                new V1PriorityOption(1, "Средний"),
                new V1PriorityOption(2, "Низкий"));

        List<String> developmentTools = Arrays.stream(DevelopmentInstrument.values())
                .map(DevelopmentInstrument::getTitle)
                .toList();

        List<V1StageInfo> stages = Arrays.stream(WorkflowStage.values())
                .map(stage -> new V1StageInfo(stage.name(), stage.stepNumber(), stage.label(),
                        WorkflowStage.TOTAL_STEPS))
                .toList();

        // Целевой может быть любая роль, которую допустимо выбрать как цель:
        // TARGET или BOTH (грейды профилей заведены как BOTH).
        // Порядок — по семействам и грейдам (как засеяны: careerTrack, затем грейд),
        // а не по алфавиту, иначе грейды и профессии перемешиваются.
        // Целевые должности: отсортированы по орг-пути (блок → дирекция → семейство → грейд),
        // чтобы фронт собрал из плоского списка дерево в стабильном порядке.
        List<JobPosition> selectable = jobPositions.findAll().stream()
                .filter(position -> position.getType() == PositionType.TARGET
                        || position.getType() == PositionType.BOTH)
                .sorted(Comparator.comparing(JobPosition::getOrgBlock,
                                Comparator.nullsLast(Comparator.naturalOrder()))
                        .thenComparing(JobPosition::getOrgDirection,
                                Comparator.nullsLast(Comparator.naturalOrder()))
                        .thenComparing(JobPosition::getCareerTrack,
                                Comparator.nullsLast(Comparator.naturalOrder()))
                        .thenComparing(JobPosition::getId,
                                Comparator.nullsLast(Comparator.naturalOrder())))
                .toList();

        List<String> targetRoles = selectable.stream()
                .map(JobPosition::getTitle)
                .distinct()
                .toList();

        List<V1TargetPosition> targetPositions = selectable.stream()
                .map(position -> new V1TargetPosition(position.getTitle(), position.getCareerTrack(),
                        position.getOrgBlock(), position.getOrgDirection()))
                .toList();

        return new V1Dictionaries(List.copyOf(goalCategories.all()), priorities, developmentTools, stages,
                targetRoles, targetPositions);
    }

    /** Профиль одной должности по названию: орг-путь (крошки) + ключевые функции. */
    @GetMapping("/position-profile")
    public V1PositionProfile positionProfile(@RequestParam String title) {
        return jobPositions.findByTitleIgnoreCase(title)
                .map(position -> new V1PositionProfile(
                        position.getTitle(),
                        position.getCareerTrack(),
                        position.getOrgBlock(),
                        position.getOrgDirection(),
                        JobProfileParser.keyFunctions(position.getJobDescriptionRef())))
                .orElse(new V1PositionProfile(title, null, null, null, List.of()));
    }

    @GetMapping("/draft")
    public V1DraftResponse getDraft(HttpServletRequest request) {
        Idp idp = sessionService.currentIdp(principal(request));
        V1Plan plan = planMapper.toPlan(idp);
        return new V1DraftResponse(plan, planValidator.isValid(plan));
    }

    @PutMapping("/draft")
    public V1DraftResponse putDraft(@RequestBody V1PlanEnvelope body, HttpServletRequest request) {
        V1Plan incoming = body == null ? null : body.plan();
        Idp idp = sessionService.saveDraft(principal(request), incoming);
        V1Plan plan = planMapper.toPlan(idp);
        return new V1DraftResponse(plan, planValidator.isValid(plan));
    }

    /**
     * Перенос готового плана в сервис «ПЛАН РАЗВИТИЯ». Невалидный план — 422 через v1-advice,
     * валидный — сохраняется, сессия завершается, возвращается подписанная ссылка.
     */
    @PostMapping("/export")
    public V1ExportResponse export(@RequestBody V1PlanEnvelope body, HttpServletRequest request) {
        V1Plan plan = body == null ? null : body.plan();
        List<V1PlanError> errors = planValidator.validate(plan);
        if (!errors.isEmpty()) {
            throw new V1PlanInvalidException(errors);
        }
        String returnUrl = sessionService.export(principal(request), plan);
        return new V1ExportResponse(true, returnUrl);
    }

    private static KeycloakPrincipal principal(HttpServletRequest request) {
        return (KeycloakPrincipal) request.getAttribute(KeycloakPrincipal.ATTRIBUTE);
    }
}
