package ru.cft.kompas.domain;

import java.util.Locale;

/**
 * Колонка «Инструмент развития (как развиваем)» формы «ПЛАН РАЗВИТИЯ» —
 * выпадающий список из трёх значений, модель 70-20-10.
 *
 * Названия принадлежат старому сервису: ассистент выбирает строго из них,
 * иначе перенесённое действие не встанет в его форму.
 */
public enum DevelopmentInstrument {

    WORKPLACE("Развитие на рабочем месте"),
    OTHERS("Развитие через других"),
    LEARNING("Развитие через учебные программы");

    private final String title;

    DevelopmentInstrument(String title) {
        this.title = title;
    }

    public String getTitle() {
        return title;
    }

    /**
     * Инструмент, к которому относится активность каталога.
     * Подаётся ассистенту вместе с самой активностью, чтобы он не угадывал.
     */
    public static DevelopmentInstrument of(ActivityType type) {
        if (type == null) {
            return WORKPLACE;
        }
        return switch (type) {
            case PRACTICE, PROJECT -> WORKPLACE;
            case MENTORING, COMMUNITY -> OTHERS;
            case COURSE, BOOK -> LEARNING;
        };
    }

    /** @return значение справочника или null, если такого нет */
    public static DevelopmentInstrument byTitle(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        String needle = value.trim().toLowerCase(Locale.ROOT).replace('ё', 'е');
        for (DevelopmentInstrument instrument : values()) {
            if (instrument.title.toLowerCase(Locale.ROOT).replace('ё', 'е').equals(needle)) {
                return instrument;
            }
        }
        return null;
    }
}
