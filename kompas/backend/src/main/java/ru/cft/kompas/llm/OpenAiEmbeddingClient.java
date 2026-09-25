package ru.cft.kompas.llm;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.http.MediaType;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import ru.cft.kompas.config.KompasProperties;

/**
 * Эмбеддинги через OpenAI-совместимый эндпоинт /embeddings.
 * Включается конфигом kompas.embeddings.provider=openai — если у провайдера он есть.
 */
public class OpenAiEmbeddingClient implements EmbeddingClient {

    private final KompasProperties.Embeddings config;
    private final ObjectMapper objectMapper;
    private final RestClient restClient;

    public OpenAiEmbeddingClient(KompasProperties.Llm llm,
                                 KompasProperties.Embeddings config,
                                 ObjectMapper objectMapper) {
        this.config = config;
        this.objectMapper = objectMapper;
        this.restClient = RestClient.builder()
                .baseUrl(llm.getBaseUrl())
                .defaultHeader("Authorization", "Bearer " + llm.getApiKey())
                .build();
    }

    @Override
    public float[] embed(String text) {
        ObjectNode body = objectMapper.createObjectNode();
        body.put("model", config.getModel());
        body.put("input", text);
        body.put("dimensions", config.getDimension());

        try {
            JsonNode response = restClient.post()
                    .uri("/embeddings")
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(body)
                    .retrieve()
                    .body(JsonNode.class);

            if (response == null) {
                throw new LlmException("Пустой ответ эндпоинта эмбеддингов");
            }
            JsonNode values = response.path("data").path(0).path("embedding");
            if (!values.isArray()) {
                throw new LlmException("Ответ эндпоинта эмбеддингов не содержит вектора");
            }

            float[] vector = new float[values.size()];
            for (int i = 0; i < values.size(); i++) {
                vector[i] = (float) values.get(i).asDouble();
            }
            return vector;
        } catch (RestClientException e) {
            throw new LlmException("Не удалось получить эмбеддинг", e);
        }
    }

    @Override
    public int dimension() {
        return config.getDimension();
    }

    @Override
    public String provider() {
        return "openai:" + config.getModel();
    }
}
