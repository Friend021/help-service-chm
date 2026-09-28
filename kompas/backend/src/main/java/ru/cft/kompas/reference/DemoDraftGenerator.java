package ru.cft.kompas.reference;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import org.springframework.stereotype.Service;
import ru.cft.kompas.dialog.DraftDto;
import ru.cft.kompas.domain.Competency;
import ru.cft.kompas.domain.DevelopmentActivity;
import ru.cft.kompas.domain.DevelopmentInstrument;
import ru.cft.kompas.repo.CompetencyRepository;
import ru.cft.kompas.repo.DevelopmentActivityRepository;

/**
 * Черновик-болванка для демонстрации и отладки переноса в «ПЛАН РАЗВИТИЯ».
 *
 * Формулировки — рыба и явно помечены как тестовые, но структура настоящая:
 * компетенции целевой роли, коды активностей каталога, рубрики целей
 * и инструменты из справочников формы. Иначе перенос проверялся бы на данных,
 * которых в форме быть не может.
 *
 * Модель не вызывается: смысл кнопки в том, чтобы получить план мгновенно.
 */
@Service
public class DemoDraftGenerator {

    private static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("dd.MM.yyyy");
    private static final int MAX_PRIORITIES = 3;
    private static final int MAX_ACTIONS = 2;

    private final CompetencyRepository competencies;
    private final DevelopmentActivityRepository activities;
    private final GoalCategoryCatalog goalCategories;

    public DemoDraftGenerator(CompetencyRepository competencies,
                              DevelopmentActivityRepository activities,
                              GoalCategoryCatalog goalCategories) {
        this.competencies = competencies;
        this.activities = activities;
        this.goalCategories = goalCategories;
    }

    /**
     * @param targetRoleId целевая роль; по ней берутся компетенции
     * @param targetRoleTitle название роли для черновика
     * @return null, если у роли нет модели компетенций — тогда набивать нечем
     */
    public DraftDto generate(Long targetRoleId, String targetRoleTitle) {
        if (targetRoleId == null) {
            return null;
        }
        List<Competency> roleCompetencies = competencies.findByRoleIdOrderByCodeAsc(targetRoleId);
        if (roleCompetencies.isEmpty()) {
            return null;
        }

        List<DevelopmentActivity> catalogue = activities.findAll();
        List<DraftDto.PriorityDto> priorities = new ArrayList<>();
        LocalDate today = LocalDate.now();

        int count = Math.min(MAX_PRIORITIES, roleCompetencies.size());
        for (int i = 0; i < count; i++) {
            Competency competency = roleCompetencies.get(i);
            LocalDate deadline = today.plusMonths(3L * (i + 1));

            priorities.add(new DraftDto.PriorityDto(
                    i + 1,
                    category(i),
                    "Тестовая цель: до %s выйти на целевой уровень по направлению «%s»."
                            .formatted(deadline.format(DATE), competency.getName()),
                    List.of(competency.getCode()),
                    actions(catalogue, competency.getCode(), deadline)));
        }

        return new DraftDto(targetRoleTitle, priorities);
    }

    /** Разные рубрики у разных приоритетов — чтобы в форме было видно, что они подставляются. */
    private String category(int index) {
        List<String> all = goalCategories.all();
        if (all.isEmpty()) {
            return null;
        }
        // Первое значение — «развитие не требуется», для черновика бессмысленно
        int from = all.size() > 1 ? 1 : 0;
        return all.get(from + index % (all.size() - from));
    }

    private List<DraftDto.ActionDto> actions(List<DevelopmentActivity> catalogue,
                                             String competencyCode,
                                             LocalDate deadline) {
        List<DraftDto.ActionDto> actions = new ArrayList<>();
        int step = 1;

        for (DevelopmentActivity activity : catalogue) {
            if (actions.size() >= MAX_ACTIONS
                    || !activity.getRelatedCompetencyCodes().contains(competencyCode)) {
                continue;
            }
            actions.add(new DraftDto.ActionDto(
                    DevelopmentInstrument.of(activity.getType()).getTitle(),
                    activity.getCode(),
                    "Тестовое действие: " + activity.getTitle(),
                    deadline.minusMonths(MAX_ACTIONS - step).toString()));
            step++;
        }

        if (actions.isEmpty()) {
            // У компетенции нет связанных активностей — строка всё равно нужна,
            // иначе блок «как развиваем» в форме окажется пустым
            actions.add(new DraftDto.ActionDto(
                    DevelopmentInstrument.WORKPLACE.getTitle(),
                    null,
                    "Тестовое действие: применить на рабочих задачах",
                    deadline.toString()));
        }
        return actions;
    }
}
