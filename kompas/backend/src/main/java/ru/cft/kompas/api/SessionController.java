package ru.cft.kompas.api;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import ru.cft.kompas.api.dto.CreateSessionRequest;
import ru.cft.kompas.api.dto.MessageRequest;
import ru.cft.kompas.api.dto.SessionResponse;
import ru.cft.kompas.api.dto.StageDto;
import ru.cft.kompas.api.dto.TurnResponse;
import ru.cft.kompas.dialog.DialogOrchestrator;
import ru.cft.kompas.dialog.DialogTurn;
import ru.cft.kompas.domain.DialogSession;
import ru.cft.kompas.domain.EntryService;
import ru.cft.kompas.repo.DialogSessionRepository;
import ru.cft.kompas.security.AccessTokenService;
import ru.cft.kompas.security.EntryContext;
import ru.cft.kompas.security.EntryTokenVerifier;
import ru.cft.kompas.security.SessionPrincipal;

@RestController
@RequestMapping("/api/sessions")
public class SessionController {

    private final EntryTokenVerifier entryTokenVerifier;
    private final EntryService entryService;
    private final DialogOrchestrator orchestrator;
    private final AccessTokenService accessTokenService;
    private final DialogSessionRepository sessions;
    private final SessionAssembler assembler;

    public SessionController(EntryTokenVerifier entryTokenVerifier,
                             EntryService entryService,
                             DialogOrchestrator orchestrator,
                             AccessTokenService accessTokenService,
                             DialogSessionRepository sessions,
                             SessionAssembler assembler) {
        this.entryTokenVerifier = entryTokenVerifier;
        this.entryService = entryService;
        this.orchestrator = orchestrator;
        this.accessTokenService = accessTokenService;
        this.sessions = sessions;
        this.assembler = assembler;
    }

    /** Создание сессии по токену входа: проверка токена, контекст сотрудника, первый ход ассистента. */
    @PostMapping
    public ResponseEntity<SessionResponse> create(@Valid @RequestBody CreateSessionRequest request) {
        EntryContext context = entryTokenVerifier.verify(request.token());
        DialogSession session = entryService.openSession(context);

        orchestrator.start(session);

        DialogSession refreshed = sessions.findById(session.getId()).orElseThrow();
        String accessToken = accessTokenService.issue(refreshed.getId(), refreshed.getEmployeeId());
        return ResponseEntity.ok(assembler.assemble(refreshed, accessToken));
    }

    @GetMapping("/{id}")
    public SessionResponse get(@PathVariable Long id, HttpServletRequest request) {
        DialogSession session = require(id, request);
        return assembler.assemble(session, null);
    }

    @PostMapping("/{id}/messages")
    public TurnResponse message(@PathVariable Long id,
                                @Valid @RequestBody MessageRequest body,
                                HttpServletRequest request) {
        DialogSession session = require(id, request);
        DialogTurn turn = orchestrator.handle(session, body.text());

        // Роль могла смениться в этом ходу — отдаём актуальную, чтобы шапка не отставала.
        Long targetRoleId = sessions.findById(id)
                .map(DialogSession::getTargetRoleId)
                .orElse(session.getTargetRoleId());

        return new TurnResponse(turn.assistantMessage(),
                StageDto.of(turn.stage()),
                assembler.positionTitle(targetRoleId),
                assembler.idpView(turn.idp()));
    }

    private DialogSession require(Long id, HttpServletRequest request) {
        SessionPrincipal principal = (SessionPrincipal) request.getAttribute(SessionPrincipal.ATTRIBUTE);
        if (principal == null || !principal.sessionId().equals(id)) {
            throw new ApiException(403, "Нет доступа к этой сессии");
        }
        return sessions.findById(id)
                .orElseThrow(() -> new ApiException(404, "Сессия не найдена"));
    }
}
