package ru.cft.kompas.rag;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import ru.cft.kompas.domain.ReferenceChunk;
import ru.cft.kompas.domain.SourceType;
import ru.cft.kompas.repo.ReferenceChunkRepository;

/**
 * Простая in-DB реализация VectorStore: векторы лежат в reference_chunk.embedding
 * строкой, поиск идёт по копии индекса в памяти (демо-корпус — сотни фрагментов).
 */
@Component
public class InDbVectorStore implements VectorStore {

    private static final Logger log = LoggerFactory.getLogger(InDbVectorStore.class);

    private final ReferenceChunkRepository repository;
    private final ObjectMapper objectMapper;
    private final List<IndexEntry> index = new CopyOnWriteArrayList<>();

    public InDbVectorStore(ReferenceChunkRepository repository, ObjectMapper objectMapper) {
        this.repository = repository;
        this.objectMapper = objectMapper;
    }

    @Override
    public void refresh() {
        List<IndexEntry> entries = new ArrayList<>();
        for (ReferenceChunk chunk : repository.findAll()) {
            float[] vector = parseVector(chunk.getEmbedding());
            if (vector.length == 0) {
                continue;
            }
            Long roleId = null;
            String code = null;
            if (chunk.getMeta() != null && !chunk.getMeta().isBlank()) {
                try {
                    JsonNode meta = objectMapper.readTree(chunk.getMeta());
                    roleId = meta.hasNonNull("roleId") ? meta.get("roleId").asLong() : null;
                    code = meta.hasNonNull("code") ? meta.get("code").asText() : null;
                } catch (Exception e) {
                    log.warn("Не удалось разобрать meta фрагмента {}", chunk.getId());
                }
            }
            entries.add(new IndexEntry(chunk.getId(), chunk.getSourceType(), chunk.getSourceRef(),
                    code, chunk.getText(), roleId, vector));
        }
        index.clear();
        index.addAll(entries);
        log.info("Векторный индекс обновлён: {} фрагментов", index.size());
    }

    @Override
    public List<RetrievedChunk> search(float[] query, int topK, SourceType type, Long roleId) {
        return index.stream()
                .filter(entry -> type == null || entry.sourceType() == type)
                .filter(entry -> roleId == null || entry.roleId() == null || roleId.equals(entry.roleId()))
                .map(entry -> new RetrievedChunk(entry.id(), entry.sourceType(), entry.sourceRef(),
                        entry.code(), entry.text(), cosine(query, entry.vector())))
                .sorted(Comparator.comparingDouble(RetrievedChunk::score).reversed())
                .limit(topK)
                .toList();
    }

    @Override
    public int size() {
        return index.size();
    }

    public static String formatVector(float[] vector) {
        StringBuilder builder = new StringBuilder(vector.length * 8);
        for (int i = 0; i < vector.length; i++) {
            if (i > 0) {
                builder.append(',');
            }
            builder.append(Float.toString(vector[i]));
        }
        return builder.toString();
    }

    private static float[] parseVector(String csv) {
        if (csv == null || csv.isBlank()) {
            return new float[0];
        }
        String[] parts = csv.split(",");
        float[] vector = new float[parts.length];
        for (int i = 0; i < parts.length; i++) {
            vector[i] = Float.parseFloat(parts[i]);
        }
        return vector;
    }

    private static double cosine(float[] a, float[] b) {
        if (a.length != b.length) {
            return 0.0;
        }
        double dot = 0.0;
        double normA = 0.0;
        double normB = 0.0;
        for (int i = 0; i < a.length; i++) {
            dot += a[i] * b[i];
            normA += a[i] * a[i];
            normB += b[i] * b[i];
        }
        if (normA == 0.0 || normB == 0.0) {
            return 0.0;
        }
        return dot / (Math.sqrt(normA) * Math.sqrt(normB));
    }

    private record IndexEntry(Long id,
                              SourceType sourceType,
                              String sourceRef,
                              String code,
                              String text,
                              Long roleId,
                              float[] vector) {
    }
}
