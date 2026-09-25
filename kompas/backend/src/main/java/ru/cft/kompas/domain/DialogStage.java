package ru.cft.kompas.domain;

/** Стадии диалогового движка (раздел 7 ТЗ). */
public enum DialogStage {

    CONTEXT("Уточнение контекста"),
    GAP_ANALYSIS("Gap-анализ компетенций"),
    INTERESTS("Интересы и формат развития"),
    DRAFT("Черновик ИПР"),
    REFINE("Доработка"),
    FINALIZE("Готов к экспорту");

    private final String title;

    DialogStage(String title) {
        this.title = title;
    }

    public String getTitle() {
        return title;
    }

    public DialogStage next() {
        DialogStage[] all = values();
        return this == FINALIZE ? FINALIZE : all[ordinal() + 1];
    }
}
