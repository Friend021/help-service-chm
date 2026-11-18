package ru.cft.kompas.v1.sse;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.MediaType;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import ru.cft.kompas.config.KompasProperties;

/**
 * Запускает SSE-поток на выделенном пуле ({@code v1SseExecutor}) и гарантированно
 * его закрывает. Producer выполняется на worker-потоке: там же открыта @Transactional
 * (open-in-view отключён), поэтому ленивые связи сущностей доступны внутри неё.
 *
 * Паттерн потока: producer первым шлёт STAGE_UPDATE (байты уходят до блокирующего
 * вызова LLM, в пределах фронтового таймаута), затем выполняет работу и стримит текст
 * ассистента порциями по {@code streamChunkWords} слов. При исключении — ERROR и complete.
 */
@Component
public class SseStreamer {

    private static final Logger log = LoggerFactory.getLogger(SseStreamer.class);

    /** Сценарий потока. Исполняется на worker-потоке. */
    @FunctionalInterface
    public interface Producer {
        void produce(SseSink sink) throws Exception;
    }

    private final ThreadPoolTaskExecutor executor;
    private final long emitterTimeoutMs;
    private final long streamDelayMs;
    private final int streamChunkWords;

    public SseStreamer(@Qualifier("v1SseExecutor") ThreadPoolTaskExecutor executor,
                       KompasProperties properties) {
        this.executor = executor;
        this.emitterTimeoutMs = properties.getV1().getEmitterTimeoutMs();
        this.streamDelayMs = properties.getV1().getStreamDelayMs();
        this.streamChunkWords = properties.getV1().getStreamChunkWords();
    }

    public SseEmitter stream(Producer producer) {
        SseEmitter emitter = new SseEmitter(emitterTimeoutMs);
        emitter.onTimeout(emitter::complete);
        emitter.onError(e -> { /* клиент отвалился — поток уже закрывается, ничего не делаем */ });

        executor.execute(() -> {
            SseSink sink = new SseSink(emitter, streamDelayMs, streamChunkWords);
            try {
                producer.produce(sink);
            } catch (Exception ex) {
                String message = ex.getMessage() == null ? "Внутренняя ошибка сервиса" : ex.getMessage();
                log.warn("Ошибка SSE-потока /api/v1: {}", message);
                sink.trySendError("internal_error", message);
            } finally {
                try {
                    emitter.complete();
                } catch (RuntimeException ignored) {
                    // поток уже закрыт клиентом
                }
            }
        });
        return emitter;
    }

    /** Тонкая обёртка над SseEmitter: пишет события и «печатает» текст порциями. */
    public static final class SseSink {

        private final SseEmitter emitter;
        private final long delayMs;
        private final int chunkWords;
        private volatile boolean closed = false;

        SseSink(SseEmitter emitter, long delayMs, int chunkWords) {
            this.emitter = emitter;
            this.delayMs = delayMs;
            this.chunkWords = chunkWords;
        }

        /** Отправить событие. При обрыве соединения помечает поток закрытым и пробрасывает ошибку. */
        public void send(V1SseEvent event) {
            if (closed) {
                return;
            }
            try {
                emitter.send(SseEmitter.event().name(event.type()).data(event, MediaType.APPLICATION_JSON));
            } catch (IOException | IllegalStateException e) {
                closed = true;
                throw new IllegalStateException("SSE-поток закрыт", e);
            }
        }

        /** Стримит текст чанками по chunkWords слов; messageId стабилен для всех дельт. */
        public void streamText(String messageId, String text) {
            if (text == null || text.isBlank()) {
                return;
            }
            List<String> words = new ArrayList<>();
            for (String word : text.trim().split("\\s+")) {
                if (!word.isEmpty()) {
                    words.add(word);
                }
            }

            int index = 0;
            while (index < words.size() && !closed) {
                int end = Math.min(index + chunkWords, words.size());
                String chunk = String.join(" ", words.subList(index, end));
                boolean last = end >= words.size();
                String delta = last ? chunk : chunk + " ";
                try {
                    send(SseEvents.messageDelta(messageId, delta));
                } catch (RuntimeException e) {
                    return; // соединение закрыто — тихо прекращаем стрим, как в моке
                }
                index = end;
                if (last) {
                    break;
                }
                try {
                    Thread.sleep(delayMs);
                } catch (InterruptedException ie) {
                    Thread.currentThread().interrupt();
                    return;
                }
            }
        }

        /** Безопасно отправить ERROR: при закрытом потоке — ничего. */
        void trySendError(String code, String message) {
            if (closed) {
                return;
            }
            try {
                send(SseEvents.error(code, message));
            } catch (RuntimeException ignored) {
                // клиент уже ушёл
            }
        }
    }
}
