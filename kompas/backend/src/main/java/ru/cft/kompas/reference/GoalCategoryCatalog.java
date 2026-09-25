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
