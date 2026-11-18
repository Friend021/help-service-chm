package ru.cft.kompas.v1.api;

import jakarta.servlet.http.HttpServletRequest;
import java.util.List;
import java.util.UUID;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import ru.cft.kompas.v1.WorkflowStage;
import ru.cft.kompas.v1.dto.DialogRequest;
import ru.cft.kompas.v1.dto.GenerateDraftRequest;
import ru.cft.kompas.v1.dto.Rating;
import ru.cft.kompas.v1.dto.RefineDraftRequest;
import ru.cft.kompas.v1.dto.V1ChatMessage;
import ru.cft.kompas.v1.dto.V1ChatMessagesResponse;
import ru.cft.kompas.v1.dto.V1ConfirmResponse;
import ru.cft.kompas.v1.dto.V1Plan;
import ru.cft.kompas.v1.dto.V1PlanEnvelope;
import ru.cft.kompas.v1.security.KeycloakPrincipal;
import ru.cft.kompas.v1.service.V1DialogService;
import ru.cft.kompas.v1.service.V1QuestionnaireService;
import ru.cft.kompas.v1.service.V1SessionService;
import ru.cft.kompas.v1.sse.SseEvents;
import ru.cft.kompas.v1.sse.SseStreamer;

/**
 * Чат нового фронта: стриминг мастера (SSE) и синхронные история/подтверждение.
 * Имена SSE-событий и поля JSON — ровно как в mock auth-mock/src/routes/chat.ts.
 *
 * Правило потоков: KeycloakPrincipal читается на servlet-потоке, в worker уходит только
 * строковый sub; сущности грузятся заново в @Transactional сервисов на worker-потоке.
 */
@RestController
@RequestMapping("/api/v1/chat")
public class V1ChatController {

    private final SseStreamer streamer;
    private final V1QuestionnaireService questionnaireService;
    private final V1DialogService dialogService;
    private final V1SessionService sessionService;

    public V1ChatController(SseStreamer streamer,
                            V1QuestionnaireService questionnaireService,
                            V1DialogService dialogService,
                            V1SessionService sessionService) {
        this.streamer = streamer;
        this.questionnaireService = questionnaireService;
        this.dialogService = dialogService;
        this.sessionService = sessionService;
    }

    /** STAGE_UPDATE(2) → MESSAGE_DELTA(intro) → QUESTIONNAIRE_READY → DONE (без LLM). */
    @PostMapping(value = "/init-assessment", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter initAssessment(HttpServletRequest request) {
        String sub = principal(request).sub();
        return streamer.stream(sink -> {
            V1QuestionnaireService.Questionnaire questionnaire = questionnaireService.prepare(sub);
            if (!questionnaire.ready()) {
                sink.send(SseEvents.error("context_incomplete",
                        "Целевая должность не определена. Сначала выполните Шаг 1.2 (ручной ввод должностей)."));
                return;
            }
            sink.send(SseEvents.stage(WorkflowStage.STAGE_2_QUESTIONNAIRE));
            String text = "Я нашёл должностную инструкцию для перехода на позицию «"
                    + questionnaire.targetRoleTitle() + "». Чтобы составить персональный план, "
                    + "оцените, пожалуйста, ваш текущий уровень по ключевым компетенциям от 1 до 5.";
            sink.streamText(UUID.randomUUID().toString(), text);
            sink.send(SseEvents.questionnaireReady(questionnaire.skills()));
            sink.send(SseEvents.done());
        });
    }

    /** STAGE_UPDATE(3) → MESSAGE_DELTA → PLAN_DRAFT_UPDATE → STAGE_UPDATE(4) → DONE (реальный LLM). */
    @PostMapping(value = "/generate-draft", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter generateDraft(@RequestBody(required = false) GenerateDraftRequest body,
                                    HttpServletRequest request) {
        String sub = principal(request).sub();
        List<Rating> ratings = body == null ? List.of() : body.ratings();
        String plannedTasks = body == null ? null : body.plannedTasks();
        return streamer.stream(sink -> {
            sink.send(SseEvents.stage(WorkflowStage.STAGE_3_DRAFT_GEN));
            V1DialogService.TurnResult result = dialogService.generateDraft(sub, ratings, plannedTasks);
            sink.streamText(result.messageId(), result.assistantText());
            sink.send(SseEvents.planDraft(result.plan()));
            sink.send(SseEvents.stage(WorkflowStage.STAGE_4_REFINEMENT));
            sink.send(SseEvents.done());
        });
    }

    /** STAGE_UPDATE(4) → PLAN_DRAFT_UPDATE → MESSAGE_DELTA → DONE. */
    @PostMapping(value = "/refine-draft", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter refineDraft(@RequestBody(required = false) RefineDraftRequest body,
                                  HttpServletRequest request) {
        String sub = principal(request).sub();
        String message = body == null ? null : body.message();
        return streamer.stream(sink -> {
            sink.send(SseEvents.stage(WorkflowStage.STAGE_4_REFINEMENT));
            V1DialogService.TurnResult result = dialogService.refine(sub, message);
            sink.send(SseEvents.planDraft(result.plan()));
            sink.streamText(result.messageId(), result.assistantText());
            sink.send(SseEvents.done());
        });
    }

    /** STAGE_UPDATE → MESSAGE_DELTA → PLAN_DRAFT_UPDATE → DIALOG_STATE → DONE. */
    @PostMapping(value = "/dialog", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter dialog(@RequestBody(required = false) DialogRequest body,
                             HttpServletRequest request) {
        String sub = principal(request).sub();
        String message = body == null ? null : body.message();
        return streamer.stream(sink -> {
            // Первый STAGE_UPDATE уходит до блокирующего LLM — по текущей стадии сессии.
            sink.send(SseEvents.stage(dialogService.activeStage(sub)));
            V1DialogService.TurnResult result = dialogService.dialog(sub, message);
            sink.streamText(result.messageId(), result.assistantText());
            sink.send(SseEvents.planDraft(result.plan()));
            boolean active = result.stage() != WorkflowStage.STAGE_5_COMPLETED;
            sink.send(SseEvents.dialogState(active, result.stage().stepNumber(), 0, WorkflowStage.TOTAL_STEPS));
            sink.send(SseEvents.done());
        });
    }

    @GetMapping("/messages")
    public V1ChatMessagesResponse messages(HttpServletRequest request) {
        List<V1ChatMessage> messages = dialogService.messages(principal(request).sub());
        return new V1ChatMessagesResponse(messages);
    }

    @PostMapping("/confirm")
    public V1ConfirmResponse confirm(@RequestBody(required = false) V1PlanEnvelope body,
                                     HttpServletRequest request) {
        V1Plan incoming = body == null ? null : body.plan();
        return sessionService.confirm(principal(request), incoming);
    }

    private static KeycloakPrincipal principal(HttpServletRequest request) {
        return (KeycloakPrincipal) request.getAttribute(KeycloakPrincipal.ATTRIBUTE);
    }
}
