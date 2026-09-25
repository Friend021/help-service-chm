package ru.cft.kompas.reference;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.dataformat.yaml.YAMLFactory;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import ru.cft.kompas.domain.ActivityType;
import ru.cft.kompas.domain.Competency;
import ru.cft.kompas.domain.DevelopmentActivity;
import ru.cft.kompas.domain.JobPosition;
import ru.cft.kompas.domain.PositionType;
import ru.cft.kompas.repo.CompetencyRepository;
import ru.cft.kompas.repo.DevelopmentActivityRepository;
import ru.cft.kompas.repo.JobPositionRepository;

/** Загружает демо-справочники из seed/reference-data.yml при пустой базе. */
@Service
public class ReferenceSeeder {

    private static final Logger log = LoggerFactory.getLogger(ReferenceSeeder.class);
    private static final String SEED_FILE = "seed/reference-data.yml";

    private final JobPositionRepository positions;
    private final CompetencyRepository competencies;
    private final DevelopmentActivityRepository activities;

    public ReferenceSeeder(JobPositionRepository positions,
                           CompetencyRepository competencies,
                           DevelopmentActivityRepository activities) {
        this.positions = positions;
        this.competencies = competencies;
        this.activities = activities;
    }

    /** @return true, если справочники были загружены (значит, нужен реиндекс RAG). */
    @Transactional
    public boolean seedIfEmpty() {
        if (positions.count() > 0) {
            log.info("Справочники уже загружены, сид пропущен");
            return false;
        }

        SeedData data = read();

        for (SeedData.SeedPosition item : data.positions()) {
            JobPosition position = new JobPosition();
            position.setTitle(item.title());
            position.setType(PositionType.valueOf(item.type()));
            position.setCareerTrack(item.careerTrack());
            position.setJobDescriptionRef(normalize(item.jobDescriptionRef()));
            positions.save(position);
        }

        List<Competency> savedCompetencies = new ArrayList<>();
        for (SeedData.SeedCompetency item : data.competencies()) {
            Competency competency = new Competency();
            competency.setCode(item.code());
            competency.setName(item.name());
            competency.setDescription(normalize(item.description()));
            competency.setTargetLevel(item.targetLevel());
            competency.setRoleId(positions.findByTitleIgnoreCase(item.role())
                    .map(JobPosition::getId)
                    .orElse(null));
            savedCompetencies.add(competency);
        }
        competencies.saveAll(savedCompetencies);

        List<DevelopmentActivity> savedActivities = new ArrayList<>();
        for (SeedData.SeedActivity item : data.activities()) {
            DevelopmentActivity activity = new DevelopmentActivity();
            activity.setCode(item.code());
            activity.setTitle(item.title());
            activity.setDescription(normalize(item.description()));
            activity.setType(ActivityType.valueOf(item.type()));
            activity.setSourceRef(item.sourceRef());
            activity.setRelatedCompetencyCodes(
                    item.competencies() == null ? new ArrayList<>() : new ArrayList<>(item.competencies()));
            savedActivities.add(activity);
        }
        activities.saveAll(savedActivities);

        log.info("Загружены демо-справочники: ролей {}, компетенций {}, активностей {}",
                data.positions().size(), savedCompetencies.size(), savedActivities.size());
        return true;
    }

    private SeedData read() {
        ObjectMapper yaml = new ObjectMapper(new YAMLFactory());
        yaml.findAndRegisterModules();
        try (InputStream stream = new ClassPathResource(SEED_FILE).getInputStream()) {
            return yaml.readValue(stream, SeedData.class);
        } catch (Exception e) {
            throw new IllegalStateException("Не удалось прочитать " + SEED_FILE, e);
        }
    }

    private static String normalize(String value) {
        return value == null ? null : value.replaceAll("\\s+", " ").trim();
    }
}
