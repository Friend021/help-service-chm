package ru.cft.kompas.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.time.LocalDate;

/**
 * Строка блока развивающих действий приоритета: как развиваем, что именно делаем,
 * к какому сроку и в каком это состоянии.
 *
 * Отражает одну строку таблицы формы «ПЛАН РАЗВИТИЯ» под каждой целью.
 */
@Entity
@Table(name = "development_action")
public class DevelopmentAction {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "order_no", nullable = false)
    private Integer orderNo;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private DevelopmentInstrument instrument = DevelopmentInstrument.WORKPLACE;

    /** Код активности каталога, если действие взято оттуда. */
    @Column(name = "activity_code")
    private String activityCode;

    /** Колонка «Конкретное действие». */
    @Column(nullable = false, columnDefinition = "text")
    private String action;

    @Column(name = "due_date")
    private LocalDate dueDate;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private ActionStatus status = ActionStatus.NOT_STARTED;

    /** Комментарий к действию (руководитель/наставник/сотрудник) — поле нового фронта. */
    @Column(columnDefinition = "text")
    private String comment;

    @Column(name = "comment_author", columnDefinition = "text")
    private String commentAuthor;

    @Column(name = "comment_created_at")
    private Instant commentCreatedAt;

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

    public DevelopmentInstrument getInstrument() {
        return instrument;
    }

    public void setInstrument(DevelopmentInstrument instrument) {
        this.instrument = instrument;
    }

    public String getActivityCode() {
        return activityCode;
    }

    public void setActivityCode(String activityCode) {
        this.activityCode = activityCode;
    }

    public String getAction() {
        return action;
    }

    public void setAction(String action) {
        this.action = action;
    }

    public LocalDate getDueDate() {
        return dueDate;
    }

    public void setDueDate(LocalDate dueDate) {
        this.dueDate = dueDate;
    }

    public ActionStatus getStatus() {
        return status;
    }

    public void setStatus(ActionStatus status) {
        this.status = status;
    }

    public String getComment() {
        return comment;
    }

    public void setComment(String comment) {
        this.comment = comment;
    }

    public String getCommentAuthor() {
        return commentAuthor;
    }

    public void setCommentAuthor(String commentAuthor) {
        this.commentAuthor = commentAuthor;
    }

    public Instant getCommentCreatedAt() {
        return commentCreatedAt;
    }

    public void setCommentCreatedAt(Instant commentCreatedAt) {
        this.commentCreatedAt = commentCreatedAt;
    }
}
