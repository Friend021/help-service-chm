package ru.cft.kompas.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import java.time.Instant;

@Entity
@Table(name = "dialog_session")
public class DialogSession {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "employee_id", nullable = false)
    private Long employeeId;

    @Column(name = "current_position_id")
    private Long currentPositionId;

    @Column(name = "target_role_id")
    private Long targetRoleId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private DialogStage stage = DialogStage.CONTEXT;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private SessionStatus status = SessionStatus.ACTIVE;

    /** Сколько ходов подряд сессия стоит на текущей стадии. Защита от зацикливания. */
    @Column(name = "stage_turns", nullable = false)
    private int stageTurns = 0;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    @PreUpdate
    void touch() {
        this.updatedAt = Instant.now();
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public Long getEmployeeId() {
        return employeeId;
    }

    public void setEmployeeId(Long employeeId) {
        this.employeeId = employeeId;
    }

    public Long getCurrentPositionId() {
        return currentPositionId;
    }

    public void setCurrentPositionId(Long currentPositionId) {
        this.currentPositionId = currentPositionId;
    }

    public Long getTargetRoleId() {
        return targetRoleId;
    }

    public void setTargetRoleId(Long targetRoleId) {
        this.targetRoleId = targetRoleId;
    }

    public DialogStage getStage() {
        return stage;
    }

    public void setStage(DialogStage stage) {
        this.stage = stage;
    }

    public SessionStatus getStatus() {
        return status;
    }

    public void setStatus(SessionStatus status) {
        this.status = status;
    }

    public int getStageTurns() {
        return stageTurns;
    }

    public void setStageTurns(int stageTurns) {
        this.stageTurns = stageTurns;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(Instant updatedAt) {
        this.updatedAt = updatedAt;
    }
}
