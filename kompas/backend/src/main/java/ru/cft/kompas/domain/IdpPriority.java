package ru.cft.kompas.domain;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Convert;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.Table;
import java.util.ArrayList;
import java.util.List;

/** Строка блока "Приоритеты развития". */
@Entity
@Table(name = "idp_priority")
public class IdpPriority {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "order_no", nullable = false)
    private Integer orderNo;

    /** Цель по развитию в формулировке SMART. */
    @Column(name = "development_goal", nullable = false, columnDefinition = "text")
    private String developmentGoal;

    /** Категория из выпадающего списка формы. Валидируется по GoalCategoryCatalog. */
    @Column(name = "goal_category")
    private String goalCategory;

    /** Коды компетенций целевой роли - колонка "Что развиваем?". */
    @Convert(converter = CsvListConverter.class)
    @Column(name = "competency_codes", columnDefinition = "text")
    private List<String> competencyCodes = new ArrayList<>();

    /** Блок «как развиваем»: инструмент, конкретное действие, срок, статус. */
    @OneToMany(cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.EAGER)
    @JoinColumn(name = "idp_priority_id", nullable = false)
    @OrderBy("orderNo asc")
    private List<DevelopmentAction> actions = new ArrayList<>();

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public Integer getOrderNo() {
        return orderNo;
    }

    public void setOrderNo(Integer orderNo) {
        this.orderNo = orderNo;
    }

    public String getGoalCategory() {
        return goalCategory;
    }

    public void setGoalCategory(String goalCategory) {
        this.goalCategory = goalCategory;
    }

    public String getDevelopmentGoal() {
        return developmentGoal;
    }

    public void setDevelopmentGoal(String developmentGoal) {
        this.developmentGoal = developmentGoal;
    }

    public List<String> getCompetencyCodes() {
        return competencyCodes;
    }

    public void setCompetencyCodes(List<String> competencyCodes) {
        this.competencyCodes = competencyCodes;
    }

    public List<DevelopmentAction> getActions() {
        return actions;
    }

    public void setActions(List<DevelopmentAction> actions) {
        this.actions = actions;
    }
}
