package ru.cft.kompas.rag;

import java.util.ArrayList;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import ru.cft.kompas.domain.Competency;
import ru.cft.kompas.domain.DevelopmentActivity;
import ru.cft.kompas.domain.JobPosition;
import ru.cft.kompas.domain.ReferenceChunk;
import ru.cft.kompas.domain.SourceType;
import ru.cft.kompas.llm.EmbeddingClient;
import ru.cft.kompas.repo.CompetencyRepository;
import ru.cft.kompas.repo.DevelopmentActivityRepository;
import ru.cft.kompas.repo.JobPositionRepository;
import ru.cft.kompas.repo.ReferenceChunkRepository;

/** Строит RAG-индекс по справочникам: должностные инструкции, компетенции, активности. */
@Service
public class ReferenceIndexer {

    private static final Logger log = LoggerFactory.getLogger(ReferenceIndexer.class);

    private final JobPositionRepository positions;
    private final CompetencyRepository competencies;
    private final DevelopmentActivityRepository activities;
    private final ReferenceChunkRepository chunks;
    private final EmbeddingClient embeddingClient;
    private final VectorStore vectorStore;

    public ReferenceIndexer(JobPositionRepository positions,
                            CompetencyRepository competencies,
                            DevelopmentActivityRepository activities,
                            ReferenceChunkRepository chunks,
                            EmbeddingClient embeddingClient,
                            VectorStore vectorStore) {
        this.positions = positions;
        this.competencies = competencies;
        this.activities = activities;
        this.chunks = chunks;
        this.embeddingClient = embeddingClient;
        this.vectorStore = vectorStore;
    }

    @Transactional
    public void reindex() {
        chunks.deleteAllInBatch();

        List<ReferenceChunk> result = new ArrayList<>();

        for (JobPosition position : positions.findAll()) {
            if (position.getJobDescriptionRef() == null || position.getJobDescriptionRef().isBlank()) {
                continue;
            }
            String text = "Должностная инструкция. Роль: %s. Карьерный трек: %s. %s"
                    .formatted(position.getTitle(),
                            position.getCareerTrack(),
                            position.getJobDescriptionRef());
            result.add(chunk(SourceType.JOB_DESCRIPTION, position.getTitle(), null,
                    position.getId(), text));
        }

        for (Competency competency : competencies.findAll()) {
            String text = "Компетенция %s: %s. %s Целевой уровень: %s."
                    .formatted(competency.getCode(),
                            competency.getName(),
                            competency.getDescription() == null ? "" : competency.getDescription(),
                            competency.getTargetLevel());
            result.add(chunk(SourceType.COMPETENCY_MODEL, competency.getName(), competency.getCode(),
                    competency.getRoleId(), text));
        }

        for (DevelopmentActivity activity : activities.findAll()) {
            String text = "Развивающая активность %s: %s. %s Тип: %s. Источник: %s. Компетенции: %s."
                    .formatted(activity.getCode(),
                            activity.getTitle(),
                            activity.getDescription() == null ? "" : activity.getDescription(),
                            activity.getType(),
                            activity.getSourceRef(),
                            String.join(", ", activity.getRelatedCompetencyCodes()));
            // Активности не привязаны к одной роли — фильтр по roleId к ним не применяется.
            result.add(chunk(SourceType.ACTIVITY_CATALOG, activity.getTitle(), activity.getCode(),
                    null, text));
        }

        chunks.saveAll(result);
        vectorStore.refresh();
        log.info("Проиндексировано фрагментов справочников: {}", result.size());
    }

    private ReferenceChunk chunk(SourceType type, String sourceRef, String code, Long roleId, String text) {
        ReferenceChunk chunk = new ReferenceChunk();
        chunk.setSourceType(type);
        chunk.setSourceRef(sourceRef);
        chunk.setText(text);
        chunk.setEmbedding(InDbVectorStore.formatVector(embeddingClient.embed(text)));
        chunk.setMeta(buildMeta(code, roleId));
        return chunk;
    }

    private String buildMeta(String code, Long roleId) {
        StringBuilder meta = new StringBuilder("{");
        if (code != null) {
            meta.append("\"code\":\"").append(code).append("\"");
        }
        if (roleId != null) {
            if (meta.length() > 1) {
                meta.append(',');
            }
            meta.append("\"roleId\":").append(roleId);
        }
        return meta.append('}').toString();
    }
}
