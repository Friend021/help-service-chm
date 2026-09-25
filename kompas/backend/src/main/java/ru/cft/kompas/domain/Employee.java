package ru.cft.kompas.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "employee")
public class Employee {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "external_id", nullable = false, unique = true)
    private String externalId;

    @Column(name = "full_name", nullable = false)
    private String fullName;

    @Column(name = "current_position_id")
    private Long currentPositionId;

    @Column(name = "manager_full_name")
    private String managerFullName;

    @Column(name = "manager_external_id")
    private String managerExternalId;

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getExternalId() {
        return externalId;
    }

    public void setExternalId(String externalId) {
        this.externalId = externalId;
    }

    public String getFullName() {
        return fullName;
    }

    public void setFullName(String fullName) {
        this.fullName = fullName;
    }

    public Long getCurrentPositionId() {
        return currentPositionId;
    }

    public void setCurrentPositionId(Long currentPositionId) {
        this.currentPositionId = currentPositionId;
    }

    public String getManagerFullName() {
        return managerFullName;
    }

    public void setManagerFullName(String managerFullName) {
        this.managerFullName = managerFullName;
    }

    public String getManagerExternalId() {
        return managerExternalId;
    }

    public void setManagerExternalId(String managerExternalId) {
        this.managerExternalId = managerExternalId;
    }
}
