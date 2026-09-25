package ru.cft.kompas.llm;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import org.junit.jupiter.api.Test;
import ru.cft.kompas.config.KompasProperties;

class OpenRouterClientTest {

    @Test
    void лимит_провайдера_и_его_сбои_повторяются() {
        // 429 у моделей из общих пулов провайдера — штатная ситуация, а не отказ
        assertThat(OpenRouterClient.retryable(429)).isTrue();
        assertThat(OpenRouterClient.retryable(500)).isTrue();
        assertThat(OpenRouterClient.retryable(502)).isTrue();
        assertThat(OpenRouterClient.retryable(503)).isTrue();
        assertThat(OpenRouterClient.retryable(504)).isTrue();
    }

    @Test
    void ошибки_запроса_не_повторяются() {
        assertThat(OpenRouterClient.retryable(400)).isFalse();
        assertThat(OpenRouterClient.retryable(401)).isFalse();
        assertThat(OpenRouterClient.retryable(402)).isFalse();
        assertThat(OpenRouterClient.retryable(404)).isFalse();
    }

    @Test
    void без_ключа_запрос_не_уходит() {
        KompasProperties.Llm config = new KompasProperties.Llm();
        config.setApiKey("");
        OpenRouterClient client = new OpenRouterClient(config, new ObjectMapper());

        assertThatThrownBy(() -> client.chat(List.of(ChatMessage.user("привет")), LlmParams.of(0.3, 100)))
                .isInstanceOf(LlmException.class)
                .hasMessageContaining("LLM_API_KEY");
    }

    @Test
    void провайдер_сообщает_выбранную_модель() {
        KompasProperties.Llm config = new KompasProperties.Llm();
        config.setModel("qwen/qwen3.8-flash");

        assertThat(new OpenRouterClient(config, new ObjectMapper()).provider())
                .isEqualTo("openrouter:qwen/qwen3.8-flash");
    }
}
