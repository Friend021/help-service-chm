package ru.cft.kompas.api;

import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import ru.cft.kompas.llm.EmbeddingClient;
import ru.cft.kompas.llm.LlmClient;
import ru.cft.kompas.rag.VectorStore;

@RestController
public class HealthController {

    private final LlmClient llmClient;
    private final EmbeddingClient embeddingClient;
    private final VectorStore vectorStore;

    public HealthController(LlmClient llmClient, EmbeddingClient embeddingClient, VectorStore vectorStore) {
        this.llmClient = llmClient;
        this.embeddingClient = embeddingClient;
        this.vectorStore = vectorStore;
    }

    @GetMapping("/api/health")
    public Map<String, Object> health() {
        return Map.of(
                "status", "UP",
                "llm", llmClient.provider(),
                "embeddings", embeddingClient.provider(),
                "ragChunks", vectorStore.size());
    }
}
