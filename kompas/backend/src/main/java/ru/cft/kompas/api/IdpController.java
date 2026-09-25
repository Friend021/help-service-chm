package ru.cft.kompas.api;

import jakarta.servlet.http.HttpServletRequest;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import ru.cft.kompas.api.dto.UpdateIdpRequest;
import ru.cft.kompas.approval.ApprovalNotifier;
import ru.cft.kompas.dialog.DraftDto;
import ru.cft.kompas.domain.Employee;
import ru.cft.kompas.domain.Idp;
import ru.cft.kompas.domain.IdpService;
import ru.cft.kompas.domain.IdpStatus;
import ru.cft.kompas.export.ExportService;
import ru.cft.kompas.export.IdpView;
import ru.cft.kompas.export.IdpViewAssembler;
import ru.cft.kompas.repo.EmployeeRepository;
import ru.cft.kompas.repo.IdpRepository;
import ru.cft.kompas.security.HandoverTokenIssuer;
import ru.cft.kompas.security.SessionPrincipal;

@RestController
@RequestMapping("/api/idp")
public class IdpController {

    private final IdpRepository idps;
    private final IdpService idpService;
    private final IdpViewAssembler viewAssembler;
    private final ExportService exportService;
    private final ApprovalNotifier approvalNotifier;
    private final EmployeeRepository employees;
    private final HandoverTokenIssuer handoverTokenIssuer;

    public IdpController(IdpRepository idps,
                         IdpService idpService,
                         IdpViewAssembler viewAssembler,
                         ExportService exportService,
                         ApprovalNotifier approvalNotifier,
                         EmployeeRepository employees,
                         HandoverTokenIssuer handoverTokenIssuer) {
        this.idps = idps;
        this.idpService = idpService;
        this.viewAssembler = viewAssembler;
        this.exportService = exportService;
        this.approvalNotifier = approvalNotifier;
        this.employees = employees;
        this.handoverTokenIssuer = handoverTokenIssuer;
    }

    @GetMapping("/{id}")
    public IdpView get(@PathVariable Long id, HttpServletRequest request) {
        return viewAssembler.assemble(require(id, request));
    }

    /** Ручная правка черновика из панели ИПР. */
    @PutMapping("/{id}")
    public IdpView update(@PathVariable Long id,
                          @RequestBody UpdateIdpRequest body,
                          HttpServletRequest request) {
        Idp idp = require(id, request);
        if (idp.getStatus() != IdpStatus.DRAFT) {
            throw new ApiException(409, "ИПР уже направлен на согласование — правка недоступна");
        }

        List<DraftDto.PriorityDto> priorities =
                body.priorities() == null ? List.of() : new ArrayList<>(body.priorities());
        Idp updated = idpService.applyDraft(idp, new DraftDto(null, priorities), idp.getTargetRoleId());
        return viewAssembler.assemble(updated);
    }

    @PostMapping("/{id}/export")
    public ResponseEntity<byte[]> export(@PathVariable Long id,
                                         @RequestParam(defaultValue = "docx") String format,
                                         HttpServletRequest request) {
        Idp idp = require(id, request);
        ExportService.Export export = exportService.export(idp, format);

        String fileName = URLEncoder.encode(export.fileName(), StandardCharsets.UTF_8);
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_TYPE, export.contentType())
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        "attachment; filename=\"" + export.fileName() + "\"; filename*=UTF-8''" + fileName)
                .header(HttpHeaders.ACCESS_CONTROL_EXPOSE_HEADERS, HttpHeaders.CONTENT_DISPOSITION)
                .contentType(MediaType.parseMediaType(export.contentType()))
                .body(export.content());
    }

    /**
     * Ссылка на форму «ПЛАН РАЗВИТИЯ» с уже разложенным по её колонкам планом.
     * Сотрудник уходит по ней и дозаполняет приоритеты в привычном сервисе.
     */
    @PostMapping("/{id}/handover")
    public Map<String, String> handover(@PathVariable Long id, HttpServletRequest request) {
        Idp idp = require(id, request);
        if (idp.getPriorities().isEmpty()) {
            throw new ApiException(409, "Нечего переносить: в плане нет приоритетов");
        }
        return Map.of("url", handoverTokenIssuer.issueUrl(viewAssembler.assemble(idp)));
    }

    /** Отправка на согласование: статус ON_APPROVAL + уведомление-заглушка. */
    @PostMapping("/{id}/submit")
    public IdpView submit(@PathVariable Long id, HttpServletRequest request) {
        Idp idp = require(id, request);
        if (idp.getPriorities().isEmpty()) {
            throw new ApiException(409, "Нельзя отправить пустой ИПР: сначала сформируйте приоритеты");
        }
        if (idp.getStatus() == IdpStatus.ON_APPROVAL) {
            throw new ApiException(409, "ИПР уже направлен на согласование");
        }

        idp.setStatus(IdpStatus.ON_APPROVAL);
        Idp saved = idps.save(idp);

        Employee employee = employees.findById(saved.getEmployeeId()).orElse(null);
        approvalNotifier.notifyManager(saved.getId(),
                employee == null ? null : employee.getFullName(),
                employee == null ? null : employee.getManagerFullName(),
                "/api/idp/" + saved.getId() + "/export?format=docx");

        return viewAssembler.assemble(saved);
    }

    private Idp require(Long id, HttpServletRequest request) {
        SessionPrincipal principal = (SessionPrincipal) request.getAttribute(SessionPrincipal.ATTRIBUTE);
        Idp idp = idps.findById(id).orElseThrow(() -> new ApiException(404, "ИПР не найден"));
        if (principal == null || !principal.employeeId().equals(idp.getEmployeeId())) {
            throw new ApiException(403, "Нет доступа к этому ИПР");
        }
        return idp;
    }
}
