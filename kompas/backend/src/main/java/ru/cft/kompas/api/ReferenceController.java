package ru.cft.kompas.api;

import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import ru.cft.kompas.domain.Competency;
import ru.cft.kompas.domain.DevelopmentActivity;
import ru.cft.kompas.repo.CompetencyRepository;
import ru.cft.kompas.repo.DevelopmentActivityRepository;

@RestController
@RequestMapping("/api/reference")
public class ReferenceController {

    private final CompetencyRepository competencies;
    private final DevelopmentActivityRepository activities;

    public ReferenceController(CompetencyRepository competencies,
                               DevelopmentActivityRepository activities) {
        this.competencies = competencies;
        this.activities = activities;
    }

    @GetMapping("/roles/{id}/competencies")
    public List<CompetencyDto> byRole(@PathVariable Long id) {
        return competencies.findByRoleIdOrderByCodeAsc(id).stream()
                .map(ReferenceController::toDto)
                .toList();
    }

    @GetMapping("/activities")
    public List<ActivityDto> activities(@RequestParam(required = false) String competency) {
        return activities.findAll().stream()
                .filter(a -> competency == null || a.getRelatedCompetencyCodes().contains(competency))
                .map(ReferenceController::toDto)
                .toList();
    }

    private static CompetencyDto toDto(Competency competency) {
        return new CompetencyDto(competency.getCode(), competency.getName(),
                competency.getDescription(), competency.getTargetLevel());
    }

    private static ActivityDto toDto(DevelopmentActivity activity) {
        return new ActivityDto(activity.getCode(), activity.getTitle(), activity.getDescription(),
                activity.getType() == null ? null : activity.getType().name(),
                activity.getSourceRef(), activity.getRelatedCompetencyCodes());
    }

    public record CompetencyDto(String code, String name, String description, Integer targetLevel) {
    }

    public record ActivityDto(String code, String title, String description, String type,
                              String sourceRef, List<String> competencyCodes) {
    }
}
