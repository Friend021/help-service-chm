package ru.cft.kompas.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;
import ru.cft.kompas.approval.ApprovalNotifier;
import ru.cft.kompas.approval.LogApprovalNotifier;
import ru.cft.kompas.llm.EmbeddingClient;
import ru.cft.kompas.llm.LlmClient;
import ru.cft.kompas.llm.LocalHashingEmbeddingClient;
import ru.cft.kompas.llm.MockLlmClient;
import ru.cft.kompas.llm.OpenAiEmbeddingClient;
import ru.cft.kompas.llm.OpenRouterClient;

/**
 * Выбор реализаций по конфигу.
 * Боевой шлюз ai.redelephant добавляется здесь же новой веткой — [POST-MVP].
 */
@Configuration
public class LlmConfig {

    private static final Logger log = LoggerFactory.getLogger(LlmConfig.class);

    /**
     * Профиль local обязан быть полностью офлайновым (раздел 13 ТЗ), поэтому он
     * перекрывает провайдера, даже если KOMPAS_LLM_PROVIDER пришёл из окружения:
     * переменные окружения по умолчанию приоритетнее профильного application.yml.
     */
    private static boolean offline(Environment environment) {
        for (String profile : environment.getActiveProfiles()) {
            if ("local".equalsIgnoreCase(profile)) {
                return true;
            }
        }
        return false;
    }

    @Bean
    public LlmClient llmClient(KompasProperties properties, ObjectMapper objectMapper,
                               Environment environment) {
        if (offline(environment)) {
            log.info("Профиль local: принудительно используется MockLlmClient");
            return new MockLlmClient();
        }

        String provider = properties.getLlm().getProvider();
        LlmClient client = switch (provider == null ? "mock" : provider.toLowerCase()) {
            case "openrouter", "openai" -> new OpenRouterClient(properties.getLlm(), objectMapper);
            case "mock" -> new MockLlmClient();
            default -> throw new IllegalStateException("Неизвестный провайдер LLM: " + provider);
        };
        log.info("Провайдер LLM: {}", client.provider());
        return client;
    }

    @Bean
    public EmbeddingClient embeddingClient(KompasProperties properties, ObjectMapper objectMapper,
                                           Environment environment) {
        if (offline(environment)) {
            log.info("Профиль local: принудительно используются локальные эмбеддинги");
            return new LocalHashingEmbeddingClient(properties.getEmbeddings().getDimension());
        }

        String provider = properties.getEmbeddings().getProvider();
        EmbeddingClient client = switch (provider == null ? "local" : provider.toLowerCase()) {
            case "openai" -> new OpenAiEmbeddingClient(properties.getLlm(),
                    properties.getEmbeddings(), objectMapper);
            case "local" -> new LocalHashingEmbeddingClient(properties.getEmbeddings().getDimension());
            default -> throw new IllegalStateException("Неизвестный провайдер эмбеддингов: " + provider);
        };
        log.info("Провайдер эмбеддингов: {}", client.provider());
        return client;
    }

    @Bean
    public ApprovalNotifier approvalNotifier(KompasProperties properties) {
        String notifier = properties.getApproval().getNotifier();
        return switch (notifier == null ? "log" : notifier.toLowerCase()) {
            case "log" -> new LogApprovalNotifier();
            default -> throw new IllegalStateException("Неизвестный notifier: " + notifier);
        };
    }
}
