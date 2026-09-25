package ru.cft.kompas.llm;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class LocalHashingEmbeddingClientTest {

    private final LocalHashingEmbeddingClient client = new LocalHashingEmbeddingClient(512);

    @Test
    void близкие_по_смыслу_тексты_ближе_далёких() {
        float[] query = client.embed("профилирование JVM и производительность приложения");
        float[] related = client.embed("Воркшоп по профилированию JVM и анализу GC-логов");
        float[] unrelated = client.embed("Нотация BPMN для банковских процессов и платежей");

        assertThat(cosine(query, related)).isGreaterThan(cosine(query, unrelated));
    }

    @Test
    void одинаковый_текст_даёт_одинаковый_вектор() {
        assertThat(client.embed("код-ревью")).isEqualTo(client.embed("код-ревью"));
    }

    @Test
    void пустой_текст_даёт_нулевой_вектор() {
        assertThat(client.embed("")).containsOnly(0.0f);
    }

    private static double cosine(float[] a, float[] b) {
        double dot = 0;
        double na = 0;
        double nb = 0;
        for (int i = 0; i < a.length; i++) {
            dot += a[i] * b[i];
            na += a[i] * a[i];
            nb += b[i] * b[i];
        }
        return dot / (Math.sqrt(na) * Math.sqrt(nb));
    }
}
