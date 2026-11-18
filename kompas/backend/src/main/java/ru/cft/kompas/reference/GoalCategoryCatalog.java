package ru.cft.kompas.reference;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.dataformat.yaml.YAMLFactory;
import java.io.InputStream;
import java.util.List;
import java.util.Locale;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

/**
 * Значения выпадающего списка «Цели по развитию» формы «ПЛАН РАЗВИТИЯ».
 *
 * Справочник принадлежит старому сервису — это буквально варианты его select.
 * «Компас» обязан выбирать строго из них: иначе перенесённый план не встанет
 * в форму. В боевой интеграции список приезжает из старого сервиса,
 * в макете лежит рядом с остальными демо-справочниками.
 */
@Component
public class GoalCategoryCatalog {

    private static final Logger log = LoggerFactory.getLogger(GoalCategoryCatalog.class);
    private static final String SEED_FILE = "seed/reference-data.yml";

    private final List<String> categories;

    public GoalCategoryCatalog() {
        this.categories = read();
        log.info("Категорий целей по развитию: {}", categories.size());
    }

    public List<String> all() {
        return categories;
    }

    /**
     * Приводит ответ модели к значению справочника: модель может вернуть его
     * с другим регистром или лишними пробелами.
     *
     * @return каноническое значение или null, если такого в справочнике нет
     */
    public String normalize(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        String needle = value.trim().toLowerCase(Locale.ROOT).replace('ё', 'е');
        for (String category : categories) {
            if (category.toLowerCase(Locale.ROOT).replace('ё', 'е').equals(needle)) {
                return category;
            }
        }
        return null;
    }

    /**
     * Слова, встречающиеся В НЕСКОЛЬКИХ категориях сразу (или структурные) — совпадение
     * по ним не несёт смысла и не должно «примагничивать» направление к чужой категории.
     * Именно из-за них ломалось сопоставление: цель со словом «роль»/«должность» утягивало
     * к «Кадровый резерв на должность/роль», хотя по смыслу категория другая.
     */
    private static final java.util.Set<String> STOP_WORDS = java.util.Set.of(
            "роль", "роли", "должность", "должности", "развитие", "развития",
            "компетенция", "компетенции", "компетенций", "компетентность",
            "увеличение", "адаптация", "изучение",
            "задача", "задачи", "задач", "выполнения", "выполняемых");

    /**
     * «Примагничивает» значение к справочнику: точное совпадение, иначе ближайшая
     * категория по пересечению ЗНАЧИМЫХ (не стоп-)слов, иначе нейтральный дефолт. Возвращает
     * всегда валидное значение справочника (или null только для пустого входа) —
     * чтобы выпадающий список формы всегда мог его выбрать.
     */
    public String snap(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        String exact = normalize(value);
        if (exact != null) {
            return exact;
        }
        java.util.Set<String> wanted = significantTokens(value);
        String best = null;
        int bestScore = 0;
        for (String category : categories) {
            int score = 0;
            for (String t : significantTokens(category)) {
                if (wanted.contains(t)) {
                    score++;
                }
            }
            if (score > bestScore) {
                bestScore = score;
                best = category;
            }
        }
        // Только УВЕРЕННЫЙ матч (минимум одно совпадение по значимому слову). Совпадения
        // лишь по стоп-словам отфильтрованы выше → bestScore останется 0 и уйдём в дефолт.
        if (best != null && bestScore > 0) {
            return best;
        }
        return neutralDefault();
    }

    /**
     * Нейтральный дефолт, когда уверенно сопоставить не удалось: «Увеличение качества
     * выполняемых задач» — безобидный catch-all для профессионального роста (не вводит в
     * заблуждение, в отличие от «Кадровый резерв» или «личностные компетенции» на техническом
     * направлении). Фолбэк — первая содержательная категория.
     */
    private String neutralDefault() {
        return categories.stream()
                .filter(c -> c.toLowerCase(Locale.ROOT).contains("качества"))
                .findFirst()
                .orElse(categories.size() > 1 ? categories.get(1) : categories.get(0));
    }

    /** Значимые слова (длиннее 3 букв, ё→е), без стоп-слов — для сопоставления категорий. */
    private static java.util.Set<String> significantTokens(String value) {
        java.util.Set<String> set = new java.util.HashSet<>();
        for (String part : value.toLowerCase(Locale.ROOT).replace('ё', 'е').split("[^a-zа-я0-9]+")) {
            if (part.length() > 3 && !STOP_WORDS.contains(part)) {
                set.add(part);
            }
        }
        return set;
    }

    private static List<String> read() {
        ObjectMapper yaml = new ObjectMapper(new YAMLFactory());
        yaml.findAndRegisterModules();
        try (InputStream stream = new ClassPathResource(SEED_FILE).getInputStream()) {
            List<String> loaded = yaml.readValue(stream, SeedData.class).goalCategories();
            if (loaded == null || loaded.isEmpty()) {
                throw new IllegalStateException("В " + SEED_FILE + " нет goalCategories");
            }
            return List.copyOf(loaded);
        } catch (Exception e) {
            throw new IllegalStateException("Не удалось прочитать категории целей из " + SEED_FILE, e);
        }
    }
}
