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

    /** Коды компетенций целевой роли - колонка "Что развиваем?". */
    @Convert(converter = CsvListConverter.class)
    @Column(name = "competency_codes", columnDefinition = "text")
    private List<String> competencyCodes = new ArrayList<>();

    /** Коды активностей из каталога. */
    @Convert(converter = CsvListConverter.class)
    @Column(name = "activity_codes", columnDefinition = "text")
    private List<String> activityCodes = new ArrayList<>();

    @OneToMany(cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.EAGER)
    @JoinColumn(name = "idp_priority_id", nullable = false)
    private List<Milestone> milestones = new ArrayList<>();

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

    public List<String> getActivityCodes() {
        return activityCodes;
    }

    public void setActivityCodes(List<String> activityCodes) {
        this.activityCodes = activityCodes;
    }

    public List<Milestone> getMilestones() {
        return milestones;
    }

    public void setMilestones(List<Milestone> milestones) {
        this.milestones = milestones;
    }
}
