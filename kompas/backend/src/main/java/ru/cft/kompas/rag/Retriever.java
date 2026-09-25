package ru.cft.kompas.rag;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import org.springframework.stereotype.Service;
import ru.cft.kompas.config.KompasProperties;
import ru.cft.kompas.domain.Competency;
import ru.cft.kompas.domain.DevelopmentActivity;
import ru.cft.kompas.domain.JobPosition;
import ru.cft.kompas.domain.PositionType;
import ru.cft.kompas.domain.SourceType;
import ru.cft.kompas.llm.EmbeddingClient;
import ru.cft.kompas.repo.CompetencyRepository;
import ru.cft.kompas.repo.DevelopmentActivityRepository;
import ru.cft.kompas.repo.JobPositionRepository;

/**
 * Собирает заземляющий контекст для диалога.
 *
 * Компетенции целевой роли подаются целиком — их немного, и ассистент обязан
 * опираться именно на них. Активности и фрагменты ДИ добираются векторным поиском.
 */
@Service
public class Retriever {

    private final VectorStore vectorStore;
    private final EmbeddingClient embeddingClient;
    private final CompetencyRepository competencies;
    private final DevelopmentActivityRepository activities;
    private final JobPositionRepository positions;
    private final KompasProperties.Rag config;

    public Retriever(VectorStore vectorStore,
                     EmbeddingClient embeddingClient,
                     CompetencyRepository competencies,
                     DevelopmentActivityRepository activities,
                     JobPositionRepository positions,
                     KompasProperties properties) {
        this.vectorStore = vectorStore;
        this.embeddingClient = embeddingClient;
        this.competencies = competencies;
        this.activities = activities;
        this.positions = positions;
        this.config = properties.getRag();
    }

    public RagContext retrieve(String query, Long targetRoleId, Long currentPositionId) {
        StringBuilder text = new StringBuilder();
        List<String> sources = new ArrayList<>();
        List<String> competencyCodes = new ArrayList<>();
        List<String> activityCodes = new ArrayList<>();

        JobPosition targetRole = targetRoleId == null
                ? null
                : positions.findById(targetRoleId).orElse(null);
        JobPosition currentPosition = currentPositionId == null
                ? null
                : positions.findById(currentPositionId).orElse(null);

        appendAvailableTargetRoles(text, sources, targetRole, currentPosition);

        if (targetRole != null && targetRole.getJobDescriptionRef() != null) {
            text.append("### Должностная инструкция целевой роли\n")
                    .append("Роль: ").append(targetRole.getTitle())
                    .append(" (трек: ").append(targetRole.getCareerTrack()).append(")\n")
                    .append(targetRole.getJobDescriptionRef()).append("\n\n");
            sources.add("ДИ: " + targetRole.getTitle());
        }

        List<Competency> roleCompetencies = targetRoleId == null
                ? List.of()
                : competencies.findByRoleIdOrderByCodeAsc(targetRoleId);

        if (!roleCompetencies.isEmpty()) {
            text.append("### Компетенции целевой роли (модель компетенций)\n");
            for (Competency competency : roleCompetencies) {
                competencyCodes.add(competency.getCode());
                text.append("- [COMP:").append(competency.getCode()).append("] ")
                        .append(competency.getName())
                        .append(" (целевой уровень ").append(competency.getTargetLevel()).append("). ")
                        .append(competency.getDescription() == null ? "" : competency.getDescription())
                        .append('\n');
                sources.add("COMP:" + competency.getCode());
            }
            text.append('\n');
        }

        List<DevelopmentActivity> relevant = findActivities(query, competencyCodes);
        if (!relevant.isEmpty()) {
            text.append("### Каталог развивающих активностей\n");
            for (DevelopmentActivity activity : relevant) {
                activityCodes.add(activity.getCode());
                // Связь с компетенциями подаётся явно: без неё ассистент подбирает
                // активности вслепую, а не под конкретный разрыв.
                text.append("- [ACT:").append(activity.getCode()).append("] ")
                        .append(activity.getTitle())
                        .append(" (тип: ").append(activity.getType())
                        .append(", источник: ").append(activity.getSourceRef())
                        .append(", развивает: ")
                        .append(String.join(" ", activity.getRelatedCompetencyCodes()))
                        .append("). ")
                        .append(activity.getDescription() == null ? "" : activity.getDescription())
                        .append('\n');
                sources.add("ACT:" + activity.getCode());
            }
            text.append('\n');
        }

        return new RagContext(text.toString(), competencyCodes, activityCodes, sources);
    }

    /**
     * Роли трека, на которые сотрудник может переключиться. Без этого блока
     * ассистенту нечего предложить, когда сотрудник не согласен с ролью из токена входа.
     */
    private void appendAvailableTargetRoles(StringBuilder text,
                                            List<String> sources,
                                            JobPosition targetRole,
                                            JobPosition currentPosition) {
        String track = targetRole != null && targetRole.getCareerTrack() != null
                ? targetRole.getCareerTrack()
                : (currentPosition == null ? null : currentPosition.getCareerTrack());

        if (track == null) {
            return;
        }

        List<JobPosition> roles = positions.findByCareerTrack(track).stream()
                .filter(position -> position.getType() != PositionType.CURRENT)
                .filter(position -> competencies.findByRoleIdOrderByCodeAsc(position.getId()).size() > 0)
                .toList();

        if (roles.isEmpty()) {
            return;
        }

        text.append("### Доступные целевые роли трека \"").append(track).append("\"\n");
        for (JobPosition role : roles) {
            text.append("- ").append(role.getTitle());
            if (targetRole != null && role.getId().equals(targetRole.getId())) {
                text.append(" (выбрана сейчас)");
            }
            text.append('\n');
            sources.add("ROLE:" + role.getTitle());
        }
        text.append('\n');
    }

    /**
     * Активности: сначала те, что связаны с компетенциями целевой роли,
     * затем добор по векторной близости к запросу.
     */
    private List<DevelopmentActivity> findActivities(String query, List<String> competencyCodes) {
        Set<String> wanted = new LinkedHashSet<>();

        if (!competencyCodes.isEmpty()) {
            for (DevelopmentActivity activity : activities.findAll()) {
                boolean matches = activity.getRelatedCompetencyCodes().stream()
                        .anyMatch(competencyCodes::contains);
                if (matches) {
                    wanted.add(activity.getCode());
                }
            }
        }

        if (query != null && !query.isBlank()) {
            float[] vector = embeddingClient.embed(query);
            List<RetrievedChunk> found = vectorStore.search(
                    vector, config.getTopK(), SourceType.ACTIVITY_CATALOG, null);
            for (RetrievedChunk chunk : found) {
                if (chunk.score() >= config.getMinScore() && chunk.code() != null) {
                    wanted.add(chunk.code());
                }
            }
        }

        if (wanted.isEmpty()) {
            return activities.findAll().stream().limit(config.getTopK()).toList();
        }
        return activities.findByCodeIn(new ArrayList<>(wanted));
    }
}
