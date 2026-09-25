package ru.cft.kompas.api;

import java.util.List;
import org.springframework.stereotype.Component;
import ru.cft.kompas.api.dto.MessageDto;
import ru.cft.kompas.api.dto.SessionResponse;
import ru.cft.kompas.api.dto.StageDto;
import ru.cft.kompas.domain.DialogSession;
import ru.cft.kompas.domain.Employee;
import ru.cft.kompas.domain.Idp;
import ru.cft.kompas.domain.JobPosition;
import ru.cft.kompas.domain.MessageRole;
import ru.cft.kompas.export.IdpView;
import ru.cft.kompas.export.IdpViewAssembler;
import ru.cft.kompas.repo.DialogMessageRepository;
import ru.cft.kompas.repo.EmployeeRepository;
import ru.cft.kompas.repo.IdpRepository;
import ru.cft.kompas.repo.JobPositionRepository;

/** Собирает ответ по состоянию сессии. */
@Component
public class SessionAssembler {

    private final EmployeeRepository employees;
    private final JobPositionRepository positions;
    private final DialogMessageRepository messages;
    private final IdpRepository idps;
    private final IdpViewAssembler idpViewAssembler;

    public SessionAssembler(EmployeeRepository employees,
                            JobPositionRepository positions,
                            DialogMessageRepository messages,
                            IdpRepository idps,
                            IdpViewAssembler idpViewAssembler) {
        this.employees = employees;
        this.positions = positions;
        this.messages = messages;
        this.idps = idps;
        this.idpViewAssembler = idpViewAssembler;
    }

    public SessionResponse assemble(DialogSession session, String accessToken) {
        Employee employee = employees.findById(session.getEmployeeId()).orElseThrow();

        String currentPosition = title(session.getCurrentPositionId());
        String targetRole = title(session.getTargetRoleId());

        List<MessageDto> history = messages.findBySessionIdOrderByIdAsc(session.getId()).stream()
                .filter(m -> m.getRole() != MessageRole.SYSTEM)
                .map(m -> new MessageDto(m.getId(), m.getRole().name().toLowerCase(),
                        m.getContent(), m.getCreatedAt()))
                .toList();

        return new SessionResponse(session.getId(),
                accessToken,
                StageDto.of(session.getStage()),
                session.getStatus().name(),
                new SessionResponse.EmployeeDto(employee.getExternalId(), employee.getFullName(),
                        currentPosition, targetRole, employee.getManagerFullName()),
                history,
                idpView(session.getId()));
    }

    public IdpView idpView(Long sessionId) {
        return idps.findBySessionId(sessionId).map(idpViewAssembler::assemble).orElse(null);
    }

    public IdpView idpView(Idp idp) {
        return idp == null ? null : idpViewAssembler.assemble(idp);
    }

    public String positionTitle(Long positionId) {
        return title(positionId);
    }

    private String title(Long positionId) {
        return positionId == null
                ? null
                : positions.findById(positionId).map(JobPosition::getTitle).orElse(null);
    }
}
