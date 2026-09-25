package ru.cft.kompas.llm;

/** Параметры генерации. */
public record LlmParams(double temperature, int maxTokens) {

    public static LlmParams of(double temperature, int maxTokens) {
        return new LlmParams(temperature, maxTokens);
    }
}
