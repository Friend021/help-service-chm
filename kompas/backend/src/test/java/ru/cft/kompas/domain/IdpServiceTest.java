package ru.cft.kompas.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import ru.cft.kompas.dialog.DraftDto;
import ru.cft.kompas.repo.IdpRepository;

class IdpServiceTest {

    private IdpRepository repository;
    private IdpService service;

    @BeforeEach
    void setUp() {
        repository = mock(IdpRepository.class);
        when(repository.save(any(Idp.class))).thenAnswer(call -> call.getArgument(0));
        service = new IdpService(repository);
    }

    @Test
    void смена_целевой_роли_сбрасывает_приоритеты_прежней_роли() {
        Idp idp = idpWithPriority("ARC-01");
        idp.setTargetRoleId(10L);

        Idp result = service.updateTargetRole(idp, 20L);

        assertThat(result.getTargetRoleId()).isEqualTo(20L);
        assertThat(result.getPriorities())
                .as("план прежней роли не должен остаться под новым заголовком")
                .isEmpty();
    }

    @Test
    void та_же_роль_не_трогает_план() {
        Idp idp = idpWithPriority("LJD-01");
        idp.setTargetRoleId(10L);

        Idp result = service.updateTargetRole(idp, 10L);

        assertThat(result.getPriorities()).hasSize(1);
    }

    @Test
    void черновик_раскладывается_в_приоритеты_с_развивающими_действиями() {
        Idp idp = new Idp();
        idp.setTargetRoleId(10L);

        DraftDto draft = new DraftDto("Ведущий разработчик Java", List.of(
                new DraftDto.PriorityDto(1, "Адаптация к должности", "Цель по SMART",
                        List.of("LJD-01"),
                        List.of(new DraftDto.ActionDto("Развитие через учебные программы",
                                        "ACT-001", "Пройти курс", "2026-10-31"),
                                new DraftDto.ActionDto("Развитие на рабочем месте",
                                        null, "Спроектировать API", "2026-11-30")))));

        Idp result = service.applyDraft(idp, draft, 10L);

        assertThat(result.getPriorities()).hasSize(1);
        IdpPriority priority = result.getPriorities().get(0);
        assertThat(priority.getOrderNo()).isEqualTo(1);
        assertThat(priority.getCompetencyCodes()).containsExactly("LJD-01");
        assertThat(priority.getActions()).hasSize(2);

        DevelopmentAction first = priority.getActions().get(0);
        assertThat(first.getOrderNo()).isEqualTo(1);
        assertThat(first.getInstrument()).isEqualTo(DevelopmentInstrument.LEARNING);
        assertThat(first.getActivityCode()).isEqualTo("ACT-001");
        assertThat(first.getDueDate().toString()).isEqualTo("2026-10-31");
        assertThat(first.getStatus())
                .as("новый план всегда начинается со статуса «Не начато»")
                .isEqualTo(ActionStatus.NOT_STARTED);

        assertThat(priority.getActions().get(1).getInstrument())
                .isEqualTo(DevelopmentInstrument.WORKPLACE);
    }

    @Test
    void некорректная_дата_действия_не_ломает_применение() {
        Idp idp = new Idp();

        DraftDto draft = new DraftDto("Роль", List.of(
                new DraftDto.PriorityDto(1, null, "Цель", List.of(),
                        List.of(new DraftDto.ActionDto("Развитие на рабочем месте",
                                null, "Действие", "как-нибудь в декабре")))));

        Idp result = service.applyDraft(idp, draft, 10L);

        assertThat(result.getPriorities().get(0).getActions().get(0).getDueDate()).isNull();
    }

    @Test
    void неизвестный_инструмент_приводится_к_работе_на_месте() {
        Idp idp = new Idp();

        DraftDto draft = new DraftDto("Роль", List.of(
                new DraftDto.PriorityDto(1, null, "Цель", List.of(),
                        List.of(new DraftDto.ActionDto("Что-то своё", null, "Действие", null)))));

        Idp result = service.applyDraft(idp, draft, 10L);

        assertThat(result.getPriorities().get(0).getActions().get(0).getInstrument())
                .isEqualTo(DevelopmentInstrument.WORKPLACE);
    }

    @Test
    void отправленный_на_согласование_план_черновиком_не_перезаписывается() {
        Idp idp = idpWithPriority("LJD-01");
        idp.setStatus(IdpStatus.ON_APPROVAL);

        DraftDto draft = new DraftDto("Роль", List.of(
                new DraftDto.PriorityDto(1, null, "Новая цель", List.of(), List.of())));

        Idp result = service.applyDraft(idp, draft, 10L);

        assertThat(result.getPriorities()).hasSize(1);
        assertThat(result.getPriorities().get(0).getDevelopmentGoal()).isEqualTo("Старая цель");
    }

    private static Idp idpWithPriority(String competencyCode) {
        Idp idp = new Idp();
        IdpPriority priority = new IdpPriority();
        priority.setOrderNo(1);
        priority.setDevelopmentGoal("Старая цель");
        priority.setCompetencyCodes(new java.util.ArrayList<>(List.of(competencyCode)));
        idp.getPriorities().add(priority);
        return idp;
    }
}
