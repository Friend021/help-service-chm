package ru.cft.kompas.v1.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

/**
 * Выделенный пул потоков под SSE-стримы /api/v1/chat/*. Отдельный от общего
 * пула приложения (и не ForkJoinPool): долгие блокирующие вызовы LLM не должны
 * занимать общие потоки.
 */
@Configuration
public class V1AsyncConfig {

    @Bean(name = "v1SseExecutor")
    public ThreadPoolTaskExecutor v1SseExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(4);
        executor.setMaxPoolSize(16);
        executor.setQueueCapacity(50);
        executor.setThreadNamePrefix("v1-sse-");
        executor.initialize();
        return executor;
    }
}
