package ru.cft.kompas.export;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;
import ru.cft.kompas.domain.Competency;
import ru.cft.kompas.domain.DevelopmentAction;
import ru.cft.kompas.domain.DevelopmentActivity;
import ru.cft.kompas.domain.Employee;
import ru.cft.kompas.domain.Idp;
import ru.cft.kompas.domain.IdpPriority;
import ru.cft.kompas.domain.JobPosition;
import ru.cft.kompas.repo.CompetencyRepository;
import ru.cft.kompas.repo.DevelopmentActivityRepository;
import ru.cft.kompas.repo.EmployeeRepository;
import ru.cft.kompas.repo.JobPositionRepository;

/** Разворачивает коды компетенций и активностей в человекочитаемые названия. */
@Service
public class IdpViewAssembler {

    private final EmployeeRepository employees;
    private final JobPositionRepository positions;
    private final CompetencyRepository competencies;
    private final DevelopmentActivityRepository activities;

    public IdpViewAssembler(EmployeeRepository employees,
                            JobPositionRepository positions,
                            CompetencyRepository competencies,
                            DevelopmentActivityRepository activities) {
        this.employees = employees;
        this.positions = positions;
        this.competencies = competencies;
        this.activities = activities;
    }

    public IdpView assemble(Idp idp) {
        Employee employee = employees.findById(idp.getEmployeeId()).orElse(null);

        String currentPosition = employee == null || employee.getCurrentPositionId() == null
                ? null
                : positions.findById(employee.getCurrentPositionId())
                        .map(JobPosition::getTitle).orElse(null);

        String targetRole = idp.getTargetRoleId() == null
                ? null
                : positions.findById(idp.getTargetRoleId()).map(JobPosition::getTitle).orElse(null);

        Map<String, Competency> competencyByCode = new LinkedHashMap<>();
        competencies.findAll().forEach(c -> competencyByCode.put(c.getCode(), c));

        Map<String, DevelopmentActivity> activityByCode = new LinkedHashMap<>();
        activities.findAll().forEach(a -> activityByCode.put(a.getCode(), a));

        List<IdpView.PriorityView> priorities = new ArrayList<>();
        for (IdpPriority priority : idp.getPriorities()) {
            List<IdpView.NamedRef> competencyRefs = new ArrayList<>();
            for (String code : priority.getCompetencyCodes()) {
                Competency competency = competencyByCode.get(code);
                competencyRefs.add(new IdpView.NamedRef(code,
                        competency == null ? code : competency.getName(),
                        competency == null || competency.getTargetLevel() == null
                                ? null
                                : "целевой уровень " + competency.getTargetLevel()));
            }

            List<IdpView.ActionView> actions = new ArrayList<>();
            for (DevelopmentAction action : priority.getActions()) {
                DevelopmentActivity activity = action.getActivityCode() == null
                        ? null
                        : activityByCode.get(action.getActivityCode());
                actions.add(new IdpView.ActionView(
                        action.getInstrument().getTitle(),
                        action.getActivityCode(),
                        activity == null ? null : activity.getTitle(),
                        activity == null ? null : activity.getSourceRef(),
                        action.getAction(),
                        action.getDueDate() == null ? null : action.getDueDate().toString(),
                        action.getStatus().getTitle()));
            }

            priorities.add(new IdpView.PriorityView(priority.getOrderNo(),
                    priority.getGoalCategory(),
                    priority.getDevelopmentGoal(), competencyRefs, actions));
        }

        return new IdpView(idp.getId(),
                idp.getDate(),
                idp.getStatus().name(),
                employee == null ? null : employee.getExternalId(),
                employee == null ? null : employee.getFullName(),
                employee == null ? null : employee.getManagerFullName(),
                currentPosition,
                targetRole,
                idp.getMainGoal(),
                priorities);
    }
}
