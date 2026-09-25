package ru.cft.kompas.rag;

import java.util.List;

/**
 * Контекст для промпта: текст, который подставляется в запрос к LLM,
 * и перечень использованных источников (уходит в meta сообщения).
 */
public record RagContext(String text,
                         List<String> competencyCodes,
                         List<String> activityCodes,
                         List<String> sources) {

    public boolean isEmpty() {
        return competencyCodes.isEmpty() && activityCodes.isEmpty();
    }
}
