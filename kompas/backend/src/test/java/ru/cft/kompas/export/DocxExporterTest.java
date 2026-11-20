package ru.cft.kompas.export;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.ByteArrayInputStream;
import java.time.LocalDate;
import java.util.List;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.apache.poi.xwpf.usermodel.XWPFTable;
import org.junit.jupiter.api.Test;

class DocxExporterTest {

    private final DocxExporter exporter = new DocxExporter();

    @Test
    void формирует_документ_с_таблицей_приоритетов() throws Exception {
        IdpView view = new IdpView(42L, LocalDate.of(2026, 9, 22), "DRAFT", "emp-001",
                "Соколова Анна Дмитриевна", "Верещагин Олег Борисович",
                "Разработчик Java", "Ведущий разработчик Java", "Переход на ведущего разработчика",
                List.of(new IdpView.PriorityView(1, "Адаптация к должности", "Цель по SMART до 31.12.2026",
                        List.of(new IdpView.NamedRef("LJD-01", "Проектирование компонентов и API",
                                "целевой уровень 3")),
                        List.of(new IdpView.ActionView("Развитие через учебные программы", "ACT-001",
                                "Внутренний курс", "Учебный центр ЦФТ",
                                "Пройти курс и защитить учебный проект", "2026-11-30", "Не начато")))));

        byte[] bytes = exporter.export(view);

        assertThat(bytes).isNotEmpty();
        try (XWPFDocument document = new XWPFDocument(new ByteArrayInputStream(bytes))) {
            String text = String.join("\n", document.getParagraphs().stream()
                    .map(p -> p.getText()).toList());

            assertThat(text).contains("Индивидуальный план развития");
            assertThat(text).contains("Соколова Анна Дмитриевна");
            assertThat(text).contains("Ведущий разработчик Java");

            // Первая таблица — «Приоритеты развития», как в форме
            assertThat(document.getTables()).hasSize(2);
            XWPFTable priorities = document.getTables().get(0);
            assertThat(priorities.getRow(0).getCell(0).getText()).isEqualTo("Приоритет");
            assertThat(priorities.getRow(0).getCell(2).getText()).isEqualTo("Что развиваем?");
            // В форме эта колонка — выпадающий список: сначала категория, под ней цель
            assertThat(priorities.getRow(1).getCell(1).getText())
                    .contains("Адаптация к должности")
                    .contains("Цель по SMART до 31.12.2026");
            assertThat(priorities.getRow(1).getCell(2).getText())
                    .isEqualTo("Проектирование компонентов и API");

            // Вторая — блок «как развиваем» под этим приоритетом
            XWPFTable actions = document.getTables().get(1);
            assertThat(actions.getRow(0).getCell(1).getText()).isEqualTo("Инструмент развития");
            assertThat(actions.getRow(0).getCell(4).getText()).isEqualTo("Статус выполнения");
            assertThat(actions.getRow(1).getCell(1).getText())
                    .isEqualTo("Развитие через учебные программы");
            assertThat(actions.getRow(1).getCell(2).getText())
                    .contains("Пройти курс и защитить учебный проект")
                    .contains("Внутренний курс");
            assertThat(actions.getRow(1).getCell(3).getText()).isEqualTo("2026-11-30");
            assertThat(actions.getRow(1).getCell(4).getText()).isEqualTo("Не начато");
        }
    }

    @Test
    void пустой_план_экспортируется_без_ошибок() {
        IdpView view = new IdpView(1L, LocalDate.now(), "DRAFT", "emp-001", "Сотрудник", "Руководитель",
                "Должность", "Роль", "Цель плана", List.of());

        assertThat(exporter.export(view)).isNotEmpty();
    }
}
