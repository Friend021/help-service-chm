package ru.cft.kompas.config;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

/** Все внешние параметры сервиса. Секреты приходят из окружения (.env). */
@ConfigurationProperties(prefix = "kompas")
public class KompasProperties {

    private Llm llm = new Llm();
    private Embeddings embeddings = new Embeddings();
    private Rag rag = new Rag();
    private Security security = new Security();
    private Approval approval = new Approval();

    public Llm getLlm() {
        return llm;
    }

    public void setLlm(Llm llm) {
        this.llm = llm;
    }

    public Embeddings getEmbeddings() {
        return embeddings;
    }

    public void setEmbeddings(Embeddings embeddings) {
        this.embeddings = embeddings;
    }

    public Rag getRag() {
        return rag;
    }

    public void setRag(Rag rag) {
        this.rag = rag;
    }

    public Security getSecurity() {
        return security;
    }

    public void setSecurity(Security security) {
        this.security = security;
    }

    public Approval getApproval() {
        return approval;
    }

    public void setApproval(Approval approval) {
        this.approval = approval;
    }

    public static class Llm {

        /** mock | openrouter (любой OpenAI-совместимый провайдер). */
        private String provider = "mock";
        private String baseUrl = "https://openrouter.ai/api/v1";
        private String apiKey = "";
        private String model = "openai/gpt-4o-mini";

        /** Запасная модель, если основную лимитирует провайдер. Пусто — без запасной. */
        private String fallbackModel = "";
        private double temperature = 0.3;
        private int maxTokens = 2500;
        private Duration timeout = Duration.ofSeconds(90);

        /**
         * Просить провайдера гарантировать JSON (response_format=json_object).
         * Поддерживают не все модели — для таких выключается конфигом.
         */
        private boolean jsonMode = true;

        public String getProvider() {
            return provider;
        }

        public void setProvider(String provider) {
            this.provider = provider;
        }

        public String getBaseUrl() {
            return baseUrl;
        }

        public void setBaseUrl(String baseUrl) {
            this.baseUrl = baseUrl;
        }

        public String getApiKey() {
            return apiKey;
        }

        public void setApiKey(String apiKey) {
            this.apiKey = apiKey;
        }

        public String getModel() {
            return model;
        }

        public void setModel(String model) {
            this.model = model;
        }

        public String getFallbackModel() {
            return fallbackModel;
        }

        public void setFallbackModel(String fallbackModel) {
            this.fallbackModel = fallbackModel;
        }

        public double getTemperature() {
            return temperature;
        }

        public void setTemperature(double temperature) {
            this.temperature = temperature;
        }

        public int getMaxTokens() {
            return maxTokens;
        }

        public void setMaxTokens(int maxTokens) {
            this.maxTokens = maxTokens;
        }

        public Duration getTimeout() {
            return timeout;
        }

        public void setTimeout(Duration timeout) {
            this.timeout = timeout;
        }

        public boolean isJsonMode() {
            return jsonMode;
        }

        public void setJsonMode(boolean jsonMode) {
            this.jsonMode = jsonMode;
        }
    }

    public static class Embeddings {

        /** local | openai */
        private String provider = "local";
        private String model = "text-embedding-3-small";
        private int dimension = 512;

        public String getProvider() {
            return provider;
        }

        public void setProvider(String provider) {
            this.provider = provider;
        }

        public String getModel() {
            return model;
        }

        public void setModel(String model) {
            this.model = model;
        }

        public int getDimension() {
            return dimension;
        }

        public void setDimension(int dimension) {
            this.dimension = dimension;
        }
    }

    public static class Rag {

        private int topK = 6;
        private double minScore = 0.02;

        public int getTopK() {
            return topK;
        }

        public void setTopK(int topK) {
            this.topK = topK;
        }

        public double getMinScore() {
            return minScore;
        }

        public void setMinScore(double minScore) {
            this.minScore = minScore;
        }
    }

    public static class Security {

        private String jwtSecret = "";
        private Duration accessTokenTtl = Duration.ofHours(12);

        public String getJwtSecret() {
            return jwtSecret;
        }

        public void setJwtSecret(String jwtSecret) {
            this.jwtSecret = jwtSecret;
        }

        public Duration getAccessTokenTtl() {
            return accessTokenTtl;
        }

        public void setAccessTokenTtl(Duration accessTokenTtl) {
            this.accessTokenTtl = accessTokenTtl;
        }
    }

    public static class Approval {

        /** log — заглушка уведомления. */
        private String notifier = "log";

        public String getNotifier() {
            return notifier;
        }

        public void setNotifier(String notifier) {
            this.notifier = notifier;
        }
    }
}
