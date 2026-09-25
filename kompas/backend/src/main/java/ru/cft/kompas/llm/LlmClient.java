package ru.cft.kompas.llm;

import java.util.List;

/**
 * Абстракция доступа к LLM.
 * Реализации: MockLlmClient (офлайн), OpenRouterClient (внешний провайдер),
 * RedElephantClient (внутренний шлюз ai.redelephant) — [POST-MVP].
 */
public interface LlmClient {

    String chat(List<ChatMessage> messages, LlmParams params);

    /** Имя провайдера для логов и диагностики. */
    String provider();
}
