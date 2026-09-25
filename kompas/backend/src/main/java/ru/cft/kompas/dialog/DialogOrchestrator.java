package ru.cft.kompas.dialog;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import ru.cft.kompas.config.KompasProperties;
import ru.cft.kompas.domain.DialogMessage;
import ru.cft.kompas.domain.DialogSession;
import ru.cft.kompas.domain.DialogStage;
import ru.cft.kompas.domain.Employee;
import ru.cft.kompas.domain.Idp;
import ru.cft.kompas.domain.IdpService;
import ru.cft.kompas.domain.JobPosition;
import ru.cft.kompas.domain.MessageRole;
import ru.cft.kompas.domain.SessionStatus;
import ru.cft.kompas.llm.ChatMessage;
import ru.cft.kompas.llm.LlmClient;
import ru.cft.kompas.llm.LlmException;
import ru.cft.kompas.llm.LlmParams;
import ru.cft.kompas.rag.RagContext;
import ru.cft.kompas.rag.Retriever;
import ru.cft.kompas.repo.DialogMessageRepository;
import ru.cft.kompas.repo.DialogSessionRepository;
import ru.cft.kompas.repo.EmployeeRepository;
import ru.cft.kompas.repo.JobPositionRepository;

/**
 * Ведёт сессию по стадиям: собирает промпт, вызывает LLM, разбирает ответ,
 * обновляет состояние сессии и черновик ИПР.
 */
@Service
public class DialogOrchestrator {

    private static final Logger log = LoggerFactory.getLogger(DialogOrchestrator.class);

    private final LlmClient llmClient;
    private final Retriever retriever;
    private final PromptBuilder promptBuilder;
    private final DraftParser draftParser;
    private final IdpService idpService;
    private final DialogSessionRepository sessions;
    private final DialogMessageRepository messages;
    private final EmployeeRepository employees;
    private final JobPositionRepository positions;
    private final ObjectMapper objectMapper;
    private final KompasProperties.Llm llmConfig;

    public DialogOrchestrator(LlmClient llmClient,
                              Retriever retriever,
                              PromptBuilder promptBuilder,
                              DraftParser draftParser,
                              IdpService idpService,
                              DialogSessionRepository sessions,
                              DialogMessageRepository messages,
                              EmployeeRepository employees,
                              JobPositionRepository positions,
                              ObjectMapper objectMapper,
                              KompasProperties properties) {
        this.llmClient = llmClient;
        this.retriever = retriever;
        this.promptBuilder = promptBuilder;
        this.draftParser = draftParser;
        this.idpService = idpService;
        this.sessions = sessions;
        this.messages = messages;
        this.employees = employees;
        this.positions = positions;
        this.objectMapper = objectMapper;
        this.llmConfig = properties.getLlm();
    }

    /**
     * Внутренняя реплика для добора черновика. В историю не попадает —
     * нужна только чтобы модель на стадии DRAFT собрала план, а не ждала сотрудника.
     */
    private static final String BUILD_DRAFT_NUDGE =
            "(сотрудник ждёт черновик — собери его по уже полученным данным)";

    /** Первый ход: приветствие и подтверждение контекста. */
    @Transactional
    public DialogTurn start(DialogSession session) {
        return advance(session, null, false);
    }

    @Transactional
    public DialogTurn handle(DialogSession session, String userMessage) {
        if (userMessage == null || userMessage.isBlank()) {
            throw new DialogException("Пустое сообщение");
        }
        return advance(session, userMessage.trim(), true);
    }

    /**
     * Ход диалога. Если после него сессия встала на стадию DRAFT, а черновика ещё нет,
     * сразу делается второй проход: иначе сотрудник получает «сейчас подготовлю план»
     * и вынужден написать лишнюю реплику, чтобы план наконец собрался.
     */
    private DialogTurn advance(DialogSession session, String userMessage, boolean persistUser) {
        TurnResult first = runTurn(session, userMessage, persistUser);

        if (session.getStage() != DialogStage.DRAFT || !first.idp().getPriorities().isEmpty()) {
            save(session.getId(), MessageRole.ASSISTANT, first.message(), first.meta());
            return new DialogTurn(first.message(), session.getStage(), first.idp());
        }

        log.info("Сессия {}: стадия DRAFT без черновика — добираем его вторым проходом",
                session.getId());
        TurnResult second = runTurn(session, BUILD_DRAFT_NUDGE, false);

        // Оба ответа склеиваем в одну реплику, чтобы история и чат совпадали.
        String message = first.message() + "\n\n" + second.message();
        save(session.getId(), MessageRole.ASSISTANT, message, second.meta());
        return new DialogTurn(message, session.getStage(), second.idp());
    }

    /** Результат одного обращения к модели: ответ уже применён к сессии и ИПР. */
    private record TurnResult(String message, Idp idp, String meta) {
    }

    private TurnResult runTurn(DialogSession session, String userMessage, boolean persistUser) {
        Employee employee = employees.findById(session.getEmployeeId())
                .orElseThrow(() -> new DialogException("Сотрудник сессии не найден"));

        JobPosition targetRole = session.getTargetRoleId() == null
                ? null
                : positions.findById(session.getTargetRoleId()).orElse(null);
        JobPosition currentPosition = session.getCurrentPositionId() == null
                ? null
                : positions.findById(session.getCurrentPositionId()).orElse(null);

        Idp idp = idpService.getOrCreate(session.getEmployeeId(), session.getId(), session.getTargetRoleId());

        String query = (userMessage == null ? "" : userMessage + " ")
                + (targetRole == null ? "" : targetRole.getTitle());
        RagContext ragContext = retriever.retrieve(query, session.getTargetRoleId(),
                session.getCurrentPositionId());

        PromptBuilder.SessionState state = new PromptBuilder.SessionState(
                employee.getFullName(),
                currentPosition == null ? null : currentPosition.getTitle(),
                targetRole == null ? null : targetRole.getTitle(),
                idpService.toDraft(idp, targetRole == null ? null : targetRole.getTitle()));

        List<ChatMessage> history = history(session.getId());
        boolean stalled = session.getStageTurns() >= PromptBuilder.STALL_AFTER_TURNS;
        if (stalled) {
            log.info("Сессия {}: стадия {} не меняется {} ходов — подсказываю модели сдвинуться",
                    session.getId(), session.getStage(), session.getStageTurns());
        }

        List<ChatMessage> prompt = promptBuilder.build(
                session.getStage(), state, ragContext, history, userMessage, stalled);

        AssistantEnvelope envelope = callWithRetry(prompt, session.getStage());

        boolean roleChanged = applyTargetRole(session, envelope.targetRole());
        if (roleChanged) {
            idp = idpService.updateTargetRole(idp, session.getTargetRoleId());
        }

        // Черновик этого хода заземлён на прежнюю роль: если роль только что сменили,
        // применять его нельзя — иначе в план попадут компетенции старой роли.
        if (roleChanged && envelope.draft() != null) {
            log.info("Целевая роль сессии {} изменена — черновик этого хода не применяется",
                    session.getId());
        } else {
            DraftDto sanitized = draftParser.sanitize(envelope.draft(),
                    ragContext.competencyCodes(), ragContext.activityCodes());
            if (sanitized != null) {
                idp = idpService.applyDraft(idp, sanitized, session.getTargetRoleId());
            }
        }

        DialogStage nextStage = resolveNextStage(envelope, idp);
        session.setStageTurns(nextStage == session.getStage() ? session.getStageTurns() + 1 : 0);
        session.setStage(nextStage);
        if (nextStage == DialogStage.FINALIZE) {
            session.setStatus(SessionStatus.COMPLETED);
        }
        sessions.save(session);

        if (persistUser && userMessage != null) {
            save(session.getId(), MessageRole.USER, userMessage, null);
        }

        return new TurnResult(envelope.message(), idp, metaJson(ragContext));
    }

    /**
     * Стадия после хода.
     *
     * Переход DRAFT → REFINE детерминирован: стадия DRAFT существует, чтобы собрать план,
     * и если план уже собран, оставаться на ней незачем. Раньше это решала модель и
     * периодически забывала — сессия зависала на DRAFT, а правки и подтверждение
     * сотрудника обрабатывались промптом сборки вместо промпта доработки.
     */
    static DialogStage resolveNextStage(AssistantEnvelope envelope, Idp idp) {
        DialogStage nextStage = DialogStage.valueOf(envelope.nextStage());
        if (nextStage == DialogStage.DRAFT && !idp.getPriorities().isEmpty()) {
            return DialogStage.REFINE;
        }
        return nextStage;
    }

    /**
     * Смена целевой роли по просьбе сотрудника. Роль принимается, только если она есть
     * в справочнике: иначе для неё нет модели компетенций и диалогу не на что опираться.
     *
     * @return true, если роль сессии действительно изменилась
     */
    private boolean applyTargetRole(DialogSession session, String requestedTitle) {
        if (requestedTitle == null || requestedTitle.isBlank()) {
            return false;
        }

        JobPosition position = positions.findByTitleIgnoreCase(requestedTitle.trim()).orElse(null);
        if (position == null) {
            log.info("Ассистент предложил роль «{}» вне справочника — игнорируем", requestedTitle);
            return false;
        }
        if (position.getId().equals(session.getTargetRoleId())) {
            return false;
        }

        log.info("Сессия {}: целевая роль переключена на «{}»", session.getId(), position.getTitle());
        session.setTargetRoleId(position.getId());
        return true;
    }

    private AssistantEnvelope callWithRetry(List<ChatMessage> prompt, DialogStage stage) {
        LlmParams params = LlmParams.of(llmConfig.getTemperature(), llmConfig.getMaxTokens());
        String raw;
        try {
            raw = llmClient.chat(prompt, params);
        } catch (LlmException e) {
            throw new DialogException("Ассистент временно недоступен: " + e.getMessage(), e);
        }

        try {
            return draftParser.parse(raw, stage);
        } catch (DraftParseException first) {
            log.warn("Неверный формат ответа LLM, повторный запрос: {}", first.getMessage());
            // Содержимое ответа может включать черновик ИПР — только DEBUG (раздел 13 ТЗ).
            log.debug("Сырой ответ LLM ({} симв.): {}", raw.length(), preview(raw));
            try {
                String retry = llmClient.chat(promptBuilder.buildRetry(prompt, raw), params);
                return draftParser.parse(retry, stage);
            } catch (LlmException e) {
                throw new DialogException("Ассистент временно недоступен: " + e.getMessage(), e);
            } catch (DraftParseException second) {
                log.warn("Повторный ответ LLM тоже не разобран: {}", second.getMessage());
                // Ход не теряем: показываем текст как есть, стадию не двигаем.
                return new AssistantEnvelope(fallbackText(raw), stage.name(), null, null);
            }
        }
    }

    private static String preview(String raw) {
        String text = raw == null ? "" : raw.replace('\n', ' ');
        return text.length() > 400 ? text.substring(0, 400) + "…" : text;
    }

    private static String fallbackText(String raw) {
        String text = raw == null ? "" : raw.trim();
        if (text.isEmpty()) {
            return "Не удалось получить ответ ассистента. Повторите вопрос, пожалуйста.";
        }
        return text.length() > 2000 ? text.substring(0, 2000) : text;
    }

    private List<ChatMessage> history(Long sessionId) {
        List<ChatMessage> result = new ArrayList<>();
        for (DialogMessage message : messages.findBySessionIdOrderByIdAsc(sessionId)) {
            if (message.getRole() == MessageRole.USER) {
                result.add(ChatMessage.user(message.getContent()));
            } else if (message.getRole() == MessageRole.ASSISTANT) {
                result.add(ChatMessage.assistant(message.getContent()));
            }
        }
        return result;
    }

    private void save(Long sessionId, MessageRole role, String content, String meta) {
        DialogMessage message = new DialogMessage();
        message.setSessionId(sessionId);
        message.setRole(role);
        message.setContent(content);
        message.setMeta(meta);
        messages.save(message);
    }

    private String metaJson(RagContext ragContext) {
        try {
            return objectMapper.writeValueAsString(Map.of(
                    "sources", ragContext.sources(),
                    "provider", llmClient.provider()));
        } catch (Exception e) {
            return null;
        }
    }
}
