package ru.cft.kompas.llm;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.time.Duration;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.HttpStatusCodeException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import ru.cft.kompas.config.KompasProperties;

/**
 * Реализация LlmClient поверх OpenAI-совместимого API (по умолчанию OpenRouter).
 * Смена провайдера — только через конфиг (kompas.llm.base-url / model / api-key).
 */
public class OpenRouterClient implements LlmClient {

    private static final Logger log = LoggerFactory.getLogger(OpenRouterClient.class);

    private static final int MAX_ATTEMPTS = 3;
    private static final long RETRY_DELAY_MS = 1500;

    private final KompasProperties.Llm config;
    private final ObjectMapper objectMapper;
    private final RestClient restClient;

    public OpenRouterClient(KompasProperties.Llm config, ObjectMapper objectMapper) {
        this.config = config;
        this.objectMapper = objectMapper;
        this.restClient = RestClient.builder()
                .baseUrl(config.getBaseUrl())
                .requestFactory(requestFactory(config.getTimeout()))
                .defaultHeader("Authorization", "Bearer " + config.getApiKey())
                .defaultHeader("HTTP-Referer", "http://localhost:4200")
                .defaultHeader("X-Title", "Kompas IDP assistant")
                .build();
    }

    private static SimpleClientHttpRequestFactory requestFactory(Duration timeout) {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout((int) Duration.ofSeconds(15).toMillis());
        factory.setReadTimeout((int) timeout.toMillis());
        return factory;
    }

    @Override
    public String chat(List<ChatMessage> messages, LlmParams params) {
        if (config.getApiKey() == null || config.getApiKey().isBlank()) {
            throw new LlmException("Не задан LLM_API_KEY: внешний провайдер недоступен. "
                    + "Запустите профиль local (MockLlmClient) или укажите ключ в .env");
        }

        ObjectNode body = objectMapper.createObjectNode();
        body.put("model", config.getModel());
        body.put("temperature", params.temperature());
        body.put("max_tokens", params.maxTokens());

        // Запасная модель на стороне OpenRouter: если основную лимитирует upstream-провайдер,
        // запрос уходит на неё, а не падает. Частая беда моделей из общих пулов.
        if (config.getFallbackModel() != null && !config.getFallbackModel().isBlank()) {
            ArrayNode models = body.putArray("models");
            models.add(config.getModel());
            models.add(config.getFallbackModel());
        }

        // Диалоговый движок разбирает ответ как JSON, поэтому просим провайдера
        // гарантировать формат — иначе модель периодически оборачивает его в прозу.
        if (config.isJsonMode()) {
            body.putObject("response_format").put("type", "json_object");
        }

        ArrayNode items = body.putArray("messages");
        for (ChatMessage message : messages) {
            ObjectNode node = items.addObject();
            node.put("role", message.role());
            node.put("content", message.content());
        }

        RuntimeException last = null;
        for (int attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
            try {
                return send(body);
            } catch (HttpStatusCodeException e) {
                int status = e.getStatusCode().value();
                if (!retryable(status) || attempt == MAX_ATTEMPTS) {
                    log.warn("Сбой вызова LLM ({}): {}", status, e.getMessage());
                    throw new LlmException(describe(status), e);
                }
                log.warn("Провайдер вернул {} (попытка {} из {}), повторяю через {} мс",
                        status, attempt, MAX_ATTEMPTS, RETRY_DELAY_MS * attempt);
                last = e;
                sleep(RETRY_DELAY_MS * attempt);
            } catch (RestClientException e) {
                log.warn("Сбой вызова LLM: {}", e.getMessage());
                throw new LlmException("Не удалось обратиться к провайдеру LLM", e);
            }
        }
        throw new LlmException("Провайдер LLM недоступен после " + MAX_ATTEMPTS + " попыток", last);
    }

    private String send(ObjectNode body) {
        JsonNode response = restClient.post()
                .uri("/chat/completions")
                .contentType(MediaType.APPLICATION_JSON)
                .body(body)
                .retrieve()
                .body(JsonNode.class);

        if (response == null) {
            throw new LlmException("Пустой ответ провайдера LLM");
        }
        if (response.hasNonNull("error")) {
            throw new LlmException("Провайдер LLM вернул ошибку: "
                    + response.get("error").path("message").asText());
        }

        JsonNode content = response.path("choices").path(0).path("message").path("content");
        if (content.isMissingNode() || content.asText().isBlank()) {
            throw new LlmException("Ответ провайдера LLM не содержит текста");
        }
        return content.asText();
    }

    /** 429 — лимит провайдера, 5xx — его временный сбой. И то и другое имеет смысл повторить. */
    static boolean retryable(int status) {
        return status == 429 || status == 500 || status == 502 || status == 503 || status == 504;
    }

    private static String describe(int status) {
        if (status == 429) {
            return "Провайдер модели сейчас ограничивает запросы. "
                    + "Повторите через минуту или переключите модель в .env";
        }
        return "Не удалось обратиться к провайдеру LLM (код " + status + ")";
    }

    private static void sleep(long millis) {
        try {
            Thread.sleep(millis);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new LlmException("Ожидание повтора прервано", e);
        }
    }

    @Override
    public String provider() {
        return "openrouter:" + config.getModel();
    }
}
