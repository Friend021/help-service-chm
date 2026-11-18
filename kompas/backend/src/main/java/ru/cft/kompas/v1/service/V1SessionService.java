package ru.cft.kompas.v1.service;

import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import ru.cft.kompas.config.KompasProperties;
import ru.cft.kompas.dialog.DraftDto;
import ru.cft.kompas.domain.DialogSession;
import ru.cft.kompas.domain.DialogStage;
import ru.cft.kompas.domain.Employee;
import ru.cft.kompas.domain.Idp;
import ru.cft.kompas.domain.IdpService;
import ru.cft.kompas.domain.JobPosition;
import ru.cft.kompas.domain.PositionType;
import ru.cft.kompas.domain.SessionStatus;
import ru.cft.kompas.export.IdpViewAssembler;
import ru.cft.kompas.repo.EmployeeRepository;
import ru.cft.kompas.repo.IdpRepository;
import ru.cft.kompas.repo.JobPositionRepository;
import ru.cft.kompas.security.EntryContext;
import ru.cft.kompas.security.HandoverTokenIssuer;
import ru.cft.kompas.v1.WorkflowStage;
import ru.cft.kompas.v1.dto.V1ConfirmPriority;
import ru.cft.kompas.v1.dto.V1ConfirmResponse;
import ru.cft.kompas.v1.dto.V1EmployeeContext;
import ru.cft.kompas.v1.dto.V1Plan;
import ru.cft.kompas.v1.dto.V1PlanError;
import ru.cft.kompas.v1.mapping.PlanMapper;
import ru.cft.kompas.v1.mapping.PlanValidator;
import ru.cft.kompas.v1.repo.V1DialogSessionRepository;
import ru.cft.kompas.v1.security.KeycloakPrincipal;

/**
 * Контекст сессии для нового фронта поверх боевых сущностей.
 *
 * Сотрудник заводится по Keycloak-sub (externalId), ему сопоставляется активная
 * сессия диалога. Сценарии повторяют ветвление мока:
 *   known_employee — демо-должности Middle → Senior Frontend Developer, сразу опросник;
 *   new_employee — должности пустые, стадия онбординга (ввод должностей).
 * Значение по умолчанию (без scenario) для новой сессии — known_employee, как в моке.
 */
@Service
public class V1SessionService {

    static final String SCENARIO_KNOWN = "known_employee";
    static final String SCENARIO_NEW = "new_employee";
    static final String DEMO_MANAGER = "Кордеболеткина Кордебалетта Кордеболетовна";
    // Демо-пара ссылается на засеянные роли с моделью компетенций (грейды профиля
    // «Менеджер проектов»): иначе опросник и gap-анализ пустые.
    static final String DEMO_CURRENT_POSITION = "Менеджер проектов";
    static final String DEMO_TARGET_POSITION = "Старший менеджер проектов";

    private final EmployeeRepository employees;
    private final JobPositionRepository positions;
    private final V1DialogSessionRepository sessions;
    private final IdpService idpService;
    private final IdpRepository idps;
    private final PlanMapper planMapper;
    private final PlanValidator planValidator;
    private final IdpViewAssembler viewAssembler;
    private final HandoverTokenIssuer handoverTokenIssuer;
    private final KompasProperties properties;

    public V1SessionService(EmployeeRepository employees,
                            JobPositionRepository positions,
                            V1DialogSessionRepository sessions,
                            IdpService idpService,
                            IdpRepository idps,
                            PlanMapper planMapper,
                            PlanValidator planValidator,
                            IdpViewAssembler viewAssembler,
                            HandoverTokenIssuer handoverTokenIssuer,
                            KompasProperties properties) {
        this.employees = employees;
        this.positions = positions;
        this.sessions = sessions;
        this.idpService = idpService;
        this.idps = idps;
        this.planMapper = planMapper;
        this.planValidator = planValidator;
        this.viewAssembler = viewAssembler;
        this.handoverTokenIssuer = handoverTokenIssuer;
        this.properties = properties;
    }

    /** Контекст + сценарий + стадия для фронта. */
    public record ContextView(V1EmployeeContext context, String scenario, WorkflowStage stage) {
    }

    private record Resolved(Employee employee, DialogSession session) {
    }

    @Transactional
    public ContextView resolve(KeycloakPrincipal principal, String scenario) {
        return view(getOrCreate(principal, scenario));
    }

    @Transactional
    public ContextView applyManualContext(KeycloakPrincipal principal,
                                          String currentPosition,
                                          String targetPosition) {
        Resolved resolved = getOrCreate(principal, null);
        Employee employee = resolved.employee();
        DialogSession session = resolved.session();

        JobPosition current = resolvePosition(currentPosition, PositionType.CURRENT);
        JobPosition target = resolvePosition(targetPosition, PositionType.TARGET);

        employee.setCurrentPositionId(current.getId());
        employees.save(employee);

        session.setCurrentPositionId(current.getId());
        session.setTargetRoleId(target.getId());
        session.setStage(DialogStage.GAP_ANALYSIS);
        session.setContextConfirmed(true);
        sessions.save(session);

        clearDraft(session);
        return view(new Resolved(employee, session));
    }

    /**
     * Приём входа из «ПЛАН РАЗВИТИЯ» через слой /api/v1 (POST /session/entry).
     * Личность и должности берём из токена входа, но ключом сотрудника остаётся
     * ТЕКУЩИЙ Keycloak-принципал — чтобы остальной sub-ключевой поток /api/v1 не разъехался.
     * Повторяет логику seedKnown, но наполняет контекст данными из EntryContext.
     * Активная сессия принципала переиспользуется (дубликаты не создаются).
     */
    @Transactional
    public ContextView applyEntry(KeycloakPrincipal principal, EntryContext ctx) {
        Resolved resolved = getOrCreate(principal, null);
        Employee employee = resolved.employee();
        DialogSession session = resolved.session();

        if (ctx.fullName() != null && !ctx.fullName().isBlank()) {
            employee.setFullName(ctx.fullName());
        }
        employee.setManagerFullName(ctx.managerFullName());
        employee.setManagerExternalId(ctx.managerExternalId());

        JobPosition current = resolvePosition(ctx.currentPosition(), PositionType.CURRENT);
        JobPosition target = resolvePosition(ctx.targetRole(), PositionType.TARGET);

        employee.setCurrentPositionId(current.getId());
        employees.save(employee);

        session.setCurrentPositionId(current.getId());
        session.setTargetRoleId(target.getId());
        session.setStage(target != null ? DialogStage.GAP_ANALYSIS : DialogStage.CONTEXT);
        session.setStageTurns(0);
        session.setContextConfirmed(false);
        sessions.save(session);

        clearDraft(session);
        return view(new Resolved(employee, session));
    }

    /** Текущий ИПР сессии принципала (создаётся при отсутствии). */
    @Transactional
    public Idp currentIdp(KeycloakPrincipal principal) {
        Resolved resolved = getOrCreate(principal, null);
        return idpService.getOrCreate(resolved.employee().getId(),
                resolved.session().getId(),
                resolved.session().getTargetRoleId());
    }

    /**
     * Полная замена черновика плана (PUT /idp/draft). Базовые поля — через легаси
     * IdpService.applyDraft, mainGoal и комментарии — поверх (новые колонки).
     */
    @Transactional
    public Idp saveDraft(KeycloakPrincipal principal, V1Plan plan) {
        V1Plan safePlan = plan == null ? new V1Plan("", List.of()) : plan;
        Resolved resolved = getOrCreate(principal, null);
        return applyPlan(resolved, safePlan);
    }

    /**
     * Подтверждение плана (POST /chat/confirm): при наличии тела — сохраняем черновик,
     * двигаем сессию к FINALIZE и отдаём сводку как в mock /chat/confirm.
     */
    @Transactional
    public V1ConfirmResponse confirm(KeycloakPrincipal principal, V1Plan incoming) {
        Resolved resolved = getOrCreate(principal, null);
        DialogSession session = resolved.session();
        Idp idp = incoming != null
                ? applyPlan(resolved, incoming)
                : idpService.getOrCreate(resolved.employee().getId(), session.getId(), session.getTargetRoleId());

        session.setStage(DialogStage.FINALIZE);
        sessions.save(session);

        V1Plan plan = planMapper.toPlan(idp);
        List<String> validationErrors = planValidator.validate(plan).stream()
                .map(V1PlanError::message).toList();
        List<V1ConfirmPriority> priorities = plan.directions() == null ? List.of()
                : plan.directions().stream()
                        .map(d -> new V1ConfirmPriority(d.goal(), d.rank(), priorityLabel(d.rank())))
                        .toList();

        return new V1ConfirmResponse(WorkflowStage.of(session).name(), plan,
                validationErrors.isEmpty(), validationErrors, priorities);
    }

    /**
     * Экспорт плана в сервис «ПЛАН РАЗВИТИЯ» (POST /idp/export). План сохраняется,
     * сессия помечается завершённой, возвращается подписанная ссылка. Валидация
     * «полноты» выполняется контроллером до вызова (невалидный план сюда не доходит).
     */
    @Transactional
    public String export(KeycloakPrincipal principal, V1Plan plan) {
        Resolved resolved = getOrCreate(principal, null);
        DialogSession session = resolved.session();
        Idp idp = applyPlan(resolved, plan);

        session.setStage(DialogStage.FINALIZE);
        sessions.save(session);

        return handoverTokenIssuer.issueUrl(viewAssembler.assemble(idp));
    }

    private Idp applyPlan(Resolved resolved, V1Plan plan) {
        V1Plan safePlan = plan == null ? new V1Plan("", List.of()) : plan;
        DialogSession session = resolved.session();
        Idp idp = idpService.getOrCreate(resolved.employee().getId(), session.getId(), session.getTargetRoleId());

        DraftDto draft = planMapper.toDraft(safePlan, targetRoleTitle(session));
        idpService.applyDraft(idp, draft, session.getTargetRoleId());
        PlanMapper.persistExtras(idp, safePlan);
        return idps.save(idp);
    }

    private static String priorityLabel(int rank) {
        return switch (rank) {
            case 0 -> "высокий";
            case 1 -> "средний";
            default -> "низкий";
        };
    }

    /** Название целевой роли для маппера черновика. */
    @Transactional(readOnly = true)
    public String targetRoleTitle(DialogSession session) {
        if (session == null || session.getTargetRoleId() == null) {
            return null;
        }
        return positions.findById(session.getTargetRoleId()).map(JobPosition::getTitle).orElse(null);
    }

    private Resolved getOrCreate(KeycloakPrincipal principal, String scenario) {
        Employee employee = getOrCreateEmployee(principal);
        boolean[] created = {false};
        DialogSession session = getOrCreateSession(employee, created);

        if (SCENARIO_KNOWN.equals(scenario)) {
            seedKnown(employee, session);
        } else if (SCENARIO_NEW.equals(scenario)) {
            seedNew(employee, session);
        } else if (created[0]) {
            seedKnown(employee, session);
        }
        return new Resolved(employee, session);
    }

    private Employee getOrCreateEmployee(KeycloakPrincipal principal) {
        Employee employee = employees.findByExternalId(principal.sub()).orElseGet(Employee::new);
        employee.setExternalId(principal.sub());
        employee.setFullName(principal.name());
        if (employee.getManagerFullName() == null) {
            employee.setManagerFullName(DEMO_MANAGER);
        }
        return employees.save(employee);
    }

    private DialogSession getOrCreateSession(Employee employee, boolean[] created) {
        return sessions.findFirstByEmployeeIdAndStatusOrderByIdDesc(employee.getId(), SessionStatus.ACTIVE)
                .orElseGet(() -> {
                    created[0] = true;
                    DialogSession session = new DialogSession();
                    session.setEmployeeId(employee.getId());
                    session.setStage(DialogStage.CONTEXT);
                    session.setStatus(SessionStatus.ACTIVE);
                    return sessions.save(session);
                });
    }

    private void seedKnown(Employee employee, DialogSession session) {
        JobPosition current = resolvePosition(DEMO_CURRENT_POSITION, PositionType.CURRENT);
        JobPosition target = resolvePosition(DEMO_TARGET_POSITION, PositionType.TARGET);

        employee.setCurrentPositionId(current.getId());
        employees.save(employee);

        session.setCurrentPositionId(current.getId());
        session.setTargetRoleId(target.getId());
        session.setStage(DialogStage.GAP_ANALYSIS);
        session.setContextConfirmed(false);
        sessions.save(session);

        clearDraft(session);
    }

    private void seedNew(Employee employee, DialogSession session) {
        employee.setCurrentPositionId(null);
        employees.save(employee);

        session.setCurrentPositionId(null);
        session.setTargetRoleId(null);
        session.setStage(DialogStage.CONTEXT);
        session.setContextConfirmed(false);
        sessions.save(session);

        clearDraft(session);
    }

    private void clearDraft(DialogSession session) {
        idps.findBySessionId(session.getId()).ifPresent(idp -> {
            idp.getPriorities().clear();
            idp.setMainGoal(null);
            idps.save(idp);
        });
    }

    /** Должность из справочника, либо заводим запись — как легаси-вход (EntryService). */
    private JobPosition resolvePosition(String title, PositionType type) {
        return positions.findByTitleIgnoreCase(title.trim()).orElseGet(() -> {
            JobPosition position = new JobPosition();
            position.setTitle(title.trim());
            position.setType(type);
            return positions.save(position);
        });
    }

    private ContextView view(Resolved resolved) {
        Employee employee = resolved.employee();
        DialogSession session = resolved.session();

        boolean known = session.getCurrentPositionId() != null;
        String currentPosition = session.getCurrentPositionId() == null ? null
                : positions.findById(session.getCurrentPositionId()).map(JobPosition::getTitle).orElse(null);
        String targetPosition = session.getTargetRoleId() == null ? null
                : positions.findById(session.getTargetRoleId()).map(JobPosition::getTitle).orElse(null);

        V1EmployeeContext context = new V1EmployeeContext(
                employee.getExternalId(),
                employee.getFullName(),
                employee.getManagerFullName() == null ? DEMO_MANAGER : employee.getManagerFullName(),
                known,
                currentPosition,
                targetPosition,
                properties.getLegacy().getImportUrl(),
                !known);

        String scenario = known ? SCENARIO_KNOWN : SCENARIO_NEW;
        return new ContextView(context, scenario, WorkflowStage.of(session));
    }
}
