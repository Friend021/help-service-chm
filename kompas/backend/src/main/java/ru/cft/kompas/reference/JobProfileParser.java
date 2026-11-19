package ru.cft.kompas.reference;

import java.util.Arrays;
import java.util.List;

/** Разбор текста профиля должности (jobDescriptionRef) на секции. */
public final class JobProfileParser {

    private static final String KEY_FUNCTIONS = "Ключевые функции:";
    /** Метки секций, которые идут ПОСЛЕ «Ключевые функции» — на них секция обрывается. */
    private static final List<String> NEXT_LABELS =
            List.of("Требуемые знания:", "Специальные навыки:", "Спец-навыки:", "Требуемый опыт:");

    private JobProfileParser() {
    }

    /** Ключевые функции должности как список пунктов (разделитель «;»). */
    public static List<String> keyFunctions(String jobDescriptionRef) {
        if (jobDescriptionRef == null) {
            return List.of();
        }
        int start = jobDescriptionRef.indexOf(KEY_FUNCTIONS);
        if (start < 0) {
            return List.of();
        }
        start += KEY_FUNCTIONS.length();
        int end = jobDescriptionRef.length();
        for (String label : NEXT_LABELS) {
            int at = jobDescriptionRef.indexOf(label, start);
            if (at >= 0 && at < end) {
                end = at;
            }
        }
        return Arrays.stream(jobDescriptionRef.substring(start, end).split(";"))
                .map(String::trim)
                .filter(part -> !part.isEmpty())
                .toList();
    }
}
