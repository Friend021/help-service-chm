package ru.cft.kompas.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Convert;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.util.ArrayList;
import java.util.List;

/** Развивающая активность из каталога («Карта развивающих действий»). */
@Entity
@Table(name = "development_activity")
public class DevelopmentActivity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true)
    private String code;

    @Column(nullable = false)
    private String title;

    @Column(columnDefinition = "text")
    private String description;

    @Enumerated(EnumType.STRING)
    private ActivityType type;

    @Column(name = "source_ref")
    private String sourceRef;

    @Convert(converter = CsvListConverter.class)
    @Column(name = "related_competency_codes", columnDefinition = "text")
    private List<String> relatedCompetencyCodes = new ArrayList<>();

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getCode() {
        return code;
    }

    public void setCode(String code) {
        this.code = code;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public ActivityType getType() {
        return type;
    }

    public void setType(ActivityType type) {
        this.type = type;
    }

    public String getSourceRef() {
        return sourceRef;
    }

    public void setSourceRef(String sourceRef) {
        this.sourceRef = sourceRef;
    }

    public List<String> getRelatedCompetencyCodes() {
        return relatedCompetencyCodes;
    }

    public void setRelatedCompetencyCodes(List<String> relatedCompetencyCodes) {
        this.relatedCompetencyCodes = relatedCompetencyCodes;
    }
}
