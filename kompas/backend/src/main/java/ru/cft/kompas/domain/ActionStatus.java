package ru.cft.kompas.domain;

/** Колонка «Статус выполнения» формы «ПЛАН РАЗВИТИЯ». */
public enum ActionStatus {

    NOT_STARTED("Не начато"),
    IN_PROGRESS("В работе"),
    DONE("Выполнено");

    private final String title;

    ActionStatus(String title) {
        this.title = title;
    }

    public String getTitle() {
        return title;
    }
}
