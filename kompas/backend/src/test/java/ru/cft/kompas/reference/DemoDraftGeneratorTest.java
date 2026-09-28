package ru.cft.kompas.reference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import ru.cft.kompas.dialog.DraftDto;
import ru.cft.kompas.domain.ActivityType;
import ru.cft.kompas.domain.Competency;
import ru.cft.kompas.domain.DevelopmentActivity;
import ru.cft.kompas.repo.CompetencyRepository;
import ru.cft.kompas.repo.DevelopmentActivityRepository;

/**
 * Болванка нужна, чтобы проверять перенос в форму, поэтому её структура обязана
 * быть настоящей: коды из справочников, рубрики и инструменты из каталогов формы.
 */
class DemoDraftGeneratorTest {

    private final GoalCategoryCatalog categories = new GoalCategoryCatalog();
    private CompetencyRepository competencies;
    private DevelopmentActivityRepository activities;
    private DemoDraftGenerator generator;

    @BeforeEach
    void setUp() {
        competencies = mock(CompetencyRepository.class);
        activities = mock(DevelopmentActivityRepository.class);
        generator = new DemoDraftGenerator(competencies, activities, categories);
    }

    @Test
    void болванка_опирается_на_компетенции_роли_и_каталог() {
        when(competencies.findByRoleIdOrderByCodeAsc(anyLong()))
                .thenReturn(List.of(competency("LJD-01", "Проектирование компонентов и API"),
                        competency("LJD-02", "Java-платформа и производительность")));
        when(activities.findAll()).thenReturn(List.of(
                activity("ACT-001", "Внутренний курс", ActivityType.COURSE, "LJD-01"),
                activity("ACT-005", "Расследовать деградацию", ActivityType.PRACTICE, "LJD-02")));

        DraftDto draft = generator.generate(10L, "Ведущий разработчик Java");

        assertThat(draft.priorities()).hasSize(2);

        DraftDto.PriorityDto first = draft.priorities().get(0);
        assertThat(first.competencyCodes()).containsExactly("LJD-01");
        assertThat(first.developmentGoal()).startsWith("Тестовая цель:");
        assertThat(first.goalCategory())
                .as("рубрика должна быть из справочника формы")
                .isIn(categories.all());
        assertThat(first.actions()).hasSize(1);
        assertThat(first.actions().get(0).activityCode()).isEqualTo("ACT-001");
        assertThat(first.actions().get(0).instrument()).isEqualTo("Развитие через учебные программы");

        assertThat(draft.priorities().get(1).actions().get(0).instrument())
                .isEqualTo("Развитие на рабочем месте");
    }

    @Test
    void у_разных_приоритетов_разные_рубрики() {
        when(competencies.findByRoleIdOrderByCodeAsc(anyLong()))
                .thenReturn(List.of(competency("A", "Первая"), competency("B", "Вторая"),
                        competency("C", "Третья")));
        when(activities.findAll()).thenReturn(List.of());

        DraftDto draft = generator.generate(10L, "Роль");

        assertThat(draft.priorities()).extracting(DraftDto.PriorityDto::goalCategory)
                .doesNotHaveDuplicates();
        assertThat(draft.priorities()).extracting(DraftDto.PriorityDto::goalCategory)
                .as("«развитие не требуется» для черновика бессмысленно")
                .doesNotContain("Цели развития не определены/Развитие не требуется");
    }

    @Test
    void компетенция_без_активностей_всё_равно_получает_действие() {
        when(competencies.findByRoleIdOrderByCodeAsc(anyLong()))
                .thenReturn(List.of(competency("LJD-09", "Без активностей")));
        when(activities.findAll()).thenReturn(List.of());

        DraftDto draft = generator.generate(10L, "Роль");

        assertThat(draft.priorities().get(0).actions())
                .as("иначе блок «как развиваем» в форме окажется пустым")
                .hasSize(1);
        assertThat(draft.priorities().get(0).actions().get(0).activityCode()).isNull();
    }

    @Test
    void роль_без_модели_компетенций_даёт_null() {
        when(competencies.findByRoleIdOrderByCodeAsc(anyLong())).thenReturn(List.of());

        assertThat(generator.generate(10L, "Роль")).isNull();
        assertThat(generator.generate(null, "Роль")).isNull();
    }

    @Test
    void больше_трёх_приоритетов_не_генерируется() {
        List<Competency> many = new ArrayList<>();
        for (int i = 0; i < 7; i++) {
            many.add(competency("C-" + i, "Компетенция " + i));
        }
        when(competencies.findByRoleIdOrderByCodeAsc(anyLong())).thenReturn(many);
        when(activities.findAll()).thenReturn(List.of());

        assertThat(generator.generate(10L, "Роль").priorities()).hasSize(3);
    }

    private static Competency competency(String code, String name) {
        Competency competency = new Competency();
        competency.setCode(code);
        competency.setName(name);
        competency.setTargetLevel(3);
        return competency;
    }

    private static DevelopmentActivity activity(String code, String title, ActivityType type,
                                                String competencyCode) {
        DevelopmentActivity activity = new DevelopmentActivity();
        activity.setCode(code);
        activity.setTitle(title);
        activity.setType(type);
        activity.setRelatedCompetencyCodes(new ArrayList<>(List.of(competencyCode)));
        return activity;
    }
}
