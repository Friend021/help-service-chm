package ru.cft.kompas.domain;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import ru.cft.kompas.repo.DialogSessionRepository;
import ru.cft.kompas.repo.EmployeeRepository;
import ru.cft.kompas.repo.JobPositionRepository;
import ru.cft.kompas.security.EntryContext;

/**
 * Приём входа из заглушки «ПЛАН РАЗВИТИЯ»: находит или заводит сотрудника,
 * сопоставляет должность и целевую роль, открывает сессию диалога.
 */
@Service
public class EntryService {

    private static final Logger log = LoggerFactory.getLogger(EntryService.class);

    private final EmployeeRepository employees;
    private final JobPositionRepository positions;
    private final DialogSessionRepository sessions;

    public EntryService(EmployeeRepository employees,
                        JobPositionRepository positions,
                        DialogSessionRepository sessions) {
        this.employees = employees;
        this.positions = positions;
        this.sessions = sessions;
    }

    @Transactional
    public DialogSession openSession(EntryContext context) {
        JobPosition currentPosition = resolve(context.currentPosition(), PositionType.CURRENT,
                context.careerTrack());
        JobPosition targetRole = resolve(context.targetRole(), PositionType.TARGET, context.careerTrack());

        Employee employee = employees.findByExternalId(context.employeeExternalId())
                .orElseGet(Employee::new);
        employee.setExternalId(context.employeeExternalId());
        employee.setFullName(context.fullName());
        employee.setManagerFullName(context.managerFullName());
        employee.setManagerExternalId(context.managerExternalId());
        employee.setCurrentPositionId(currentPosition == null ? null : currentPosition.getId());
        employee = employees.save(employee);

        DialogSession session = new DialogSession();
        session.setEmployeeId(employee.getId());
        session.setCurrentPositionId(currentPosition == null ? null : currentPosition.getId());
        session.setTargetRoleId(targetRole == null ? null : targetRole.getId());
        session.setStage(DialogStage.CONTEXT);
        session.setStatus(SessionStatus.ACTIVE);
        session = sessions.save(session);

        log.info("Открыта сессия {} для сотрудника {}", session.getId(), employee.getExternalId());
        return session;
    }

    /** Должность из токена может отсутствовать в справочнике — заводим запись, чтобы не терять контекст. */
    private JobPosition resolve(String title, PositionType type, String careerTrack) {
        if (title == null || title.isBlank()) {
            return null;
        }
        return positions.findByTitleIgnoreCase(title.trim()).orElseGet(() -> {
            log.info("Должность «{}» не найдена в справочнике — создаётся запись без компетенций", title);
            JobPosition position = new JobPosition();
            position.setTitle(title.trim());
            position.setType(type);
            position.setCareerTrack(careerTrack);
            return positions.save(position);
        });
    }
}
