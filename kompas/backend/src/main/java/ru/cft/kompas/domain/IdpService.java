package ru.cft.kompas.domain;

import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import ru.cft.kompas.dialog.DraftDto;
import ru.cft.kompas.repo.IdpRepository;

/** Доменные операции над ИПР: применение черновика, чтение, фиксация статуса. */
@Service
public class IdpService {

    private static final Logger log = LoggerFactory.getLogger(IdpService.class);

    private final IdpRepository repository;

    public IdpService(IdpRepository repository) {
        this.repository = repository;
    }

    @Transactional
    public Idp getOrCreate(Long employeeId, Long sessionId, Long targetRoleId) {
        return repository.findBySessionId(sessionId).orElseGet(() -> {
            Idp idp = new Idp();
            idp.setEmployeeId(employeeId);
            idp.setSessionId(sessionId);
            idp.setTargetRoleId(targetRoleId);
            idp.setDate(LocalDate.now());
            idp.setStatus(IdpStatus.DRAFT);
            return repository.save(idp);
        });
    }

    /**
     * Смена целевой роли в диалоге.
     *
     * Прежние приоритеты сбрасываются: они были построены на компетенциях старой роли,
     * и оставить их — значит показать план, где заголовок от одной роли,
     * а содержимое от другой. Новый черновик соберётся на следующем ходу.
     */
    @Transactional
    public Idp updateTargetRole(Idp idp, Long targetRoleId) {
        if (idp == null || targetRoleId == null || targetRoleId.equals(idp.getTargetRoleId())) {
            return idp;
        }

        idp.setTargetRoleId(targetRoleId);
        if (!idp.getPriorities().isEmpty()) {
            log.info("ИПР {}: целевая роль сменилась, сбрасываю {} приоритет(ов) прежней роли",
                    idp.getId(), idp.getPriorities().size());
            idp.getPriorities().clear();
        }
        return repository.save(idp);
    }

    /** Черновик из ответа ассистента полностью заменяет текущий набор приоритетов. */
    @Transactional
    public Idp applyDraft(Idp idp, DraftDto draft, Long targetRoleId) {
        if (draft == null) {
            return idp;
        }
        if (idp.getStatus() != IdpStatus.DRAFT) {
            log.info("ИПР {} уже не в статусе DRAFT — черновик не применяется", idp.getId());
            return idp;
        }

        if (targetRoleId != null) {
            idp.setTargetRoleId(targetRoleId);
        }

        idp.getPriorities().clear();
        List<DraftDto.PriorityDto> source = draft.priorities() == null ? List.of() : draft.priorities();

        int order = 1;
        for (DraftDto.PriorityDto item : source) {
            IdpPriority priority = new IdpPriority();
            priority.setOrderNo(item.order() == null ? order : item.order());
            priority.setGoalCategory(item.goalCategory());
            priority.setDevelopmentGoal(item.developmentGoal());
            priority.setCompetencyCodes(new ArrayList<>(
                    item.competencyCodes() == null ? List.of() : item.competencyCodes()));

            List<DraftDto.ActionDto> actions = item.actions() == null ? List.of() : item.actions();
            int actionOrder = 1;
            for (DraftDto.ActionDto actionDto : actions) {
                if (actionDto.action() == null || actionDto.action().isBlank()) {
                    continue;
                }
                DevelopmentAction action = new DevelopmentAction();
                action.setOrderNo(actionOrder++);
                action.setInstrument(DevelopmentInstrument.byTitle(actionDto.instrument()) == null
                        ? DevelopmentInstrument.WORKPLACE
                        : DevelopmentInstrument.byTitle(actionDto.instrument()));
                action.setActivityCode(actionDto.activityCode());
                action.setAction(actionDto.action().trim());
                action.setDueDate(parseDate(actionDto.dueDate()));
                action.setStatus(ActionStatus.NOT_STARTED);
                priority.getActions().add(action);
            }

            idp.getPriorities().add(priority);
            order++;
        }

        return repository.save(idp);
    }

    @Transactional(readOnly = true)
    public DraftDto toDraft(Idp idp, String targetRoleTitle) {
        if (idp == null) {
            return null;
        }
        List<DraftDto.PriorityDto> priorities = new ArrayList<>();
        for (IdpPriority priority : idp.getPriorities()) {
            List<DraftDto.ActionDto> actions = priority.getActions().stream()
                    .map(a -> new DraftDto.ActionDto(a.getInstrument().getTitle(),
                            a.getActivityCode(),
                            a.getAction(),
                            a.getDueDate() == null ? null : a.getDueDate().toString()))
                    .toList();
            priorities.add(new DraftDto.PriorityDto(priority.getOrderNo(),
                    priority.getGoalCategory(),
                    priority.getDevelopmentGoal(),
                    List.copyOf(priority.getCompetencyCodes()),
                    actions));
        }
        return new DraftDto(targetRoleTitle, priorities);
    }

    private static LocalDate parseDate(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        try {
            return LocalDate.parse(value.trim());
        } catch (DateTimeParseException e) {
            log.warn("Некорректная дата реперной точки: {}", value);
            return null;
        }
    }
}
