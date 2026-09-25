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
            priority.setDevelopmentGoal(item.developmentGoal());
            priority.setCompetencyCodes(new ArrayList<>(
                    item.competencyCodes() == null ? List.of() : item.competencyCodes()));
            priority.setActivityCodes(new ArrayList<>(
                    item.activityCodes() == null ? List.of() : item.activityCodes()));

            List<DraftDto.MilestoneDto> milestones =
                    item.milestones() == null ? List.of() : item.milestones();
            for (DraftDto.MilestoneDto milestoneDto : milestones) {
                Milestone milestone = new Milestone();
                milestone.setTitle(milestoneDto.title());
                milestone.setDueDate(parseDate(milestoneDto.dueDate()));
                milestone.setStatus(MilestoneStatus.PLANNED);
                priority.getMilestones().add(milestone);
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
            List<DraftDto.MilestoneDto> milestones = priority.getMilestones().stream()
                    .map(m -> new DraftDto.MilestoneDto(m.getTitle(),
                            m.getDueDate() == null ? null : m.getDueDate().toString()))
                    .toList();
            priorities.add(new DraftDto.PriorityDto(priority.getOrderNo(),
                    priority.getDevelopmentGoal(),
                    List.copyOf(priority.getCompetencyCodes()),
                    List.copyOf(priority.getActivityCodes()),
                    milestones));
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
