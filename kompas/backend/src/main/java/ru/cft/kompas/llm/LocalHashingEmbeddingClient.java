package ru.cft.kompas.llm;

import java.util.Locale;

/**
 * Офлайн-эмбеддинги: хеширование словоформ и символьных триграмм в фиксированную размерность.
 * Качества боевой модели не даёт, но детерминирован, не требует сети и достаточен
 * для лексического поиска по демо-справочникам на русском.
 */
public class LocalHashingEmbeddingClient implements EmbeddingClient {

    private static final int MIN_TOKEN_LENGTH = 3;
    private static final int STEM_LENGTH = 6;

    private final int dimension;

    public LocalHashingEmbeddingClient(int dimension) {
        this.dimension = dimension;
    }

    @Override
    public float[] embed(String text) {
        float[] vector = new float[dimension];
        if (text == null || text.isBlank()) {
            return vector;
        }

        String normalized = text.toLowerCase(Locale.ROOT).replace('ё', 'е');
        for (String token : normalized.split("[^\\p{L}\\p{Nd}]+")) {
            if (token.length() < MIN_TOKEN_LENGTH) {
                continue;
            }
            // Грубый стемминг: русские окончания отбрасываем усечением.
            String stem = token.length() > STEM_LENGTH ? token.substring(0, STEM_LENGTH) : token;
            add(vector, stem, 1.0f);
            addTrigrams(vector, token);
        }

        normalize(vector);
        return vector;
    }

    private void addTrigrams(float[] vector, String token) {
        String padded = "^" + token + "$";
        for (int i = 0; i + 3 <= padded.length(); i++) {
            add(vector, padded.substring(i, i + 3), 0.35f);
        }
    }

    private void add(float[] vector, String feature, float weight) {
        int hash = feature.hashCode();
        int index = Math.floorMod(hash, dimension);
        // Знак второго хеша снижает влияние коллизий.
        int sign = Math.floorMod(hash * 31 + 7, 2) == 0 ? 1 : -1;
        vector[index] += weight * sign;
    }

    private void normalize(float[] vector) {
        double norm = 0.0;
        for (float value : vector) {
            norm += value * value;
        }
        norm = Math.sqrt(norm);
        if (norm == 0.0) {
            return;
        }
        for (int i = 0; i < vector.length; i++) {
            vector[i] = (float) (vector[i] / norm);
        }
    }

    @Override
    public int dimension() {
        return dimension;
    }

    @Override
    public String provider() {
        return "local-hashing";
    }
}
