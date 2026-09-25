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
                "Разработчик Java", "Ведущий разработчик Java",
                List.of(new IdpView.PriorityView(1, "Цель по SMART до 31.12.2026",
                        List.of(new IdpView.NamedRef("LJD-01", "Проектирование компонентов и API",
                                "целевой уровень 3")),
                        List.of(new IdpView.NamedRef("ACT-001", "Внутренний курс", "Учебный центр ЦФТ")),
                        List.of(new IdpView.MilestoneView("Промежуточная проверка", "2026-11-30",
                                "PLANNED")))));

        byte[] bytes = exporter.export(view);

        assertThat(bytes).isNotEmpty();
        try (XWPFDocument document = new XWPFDocument(new ByteArrayInputStream(bytes))) {
            String text = String.join("\n", document.getParagraphs().stream()
                    .map(p -> p.getText()).toList());

            assertThat(text).contains("Индивидуальный план развития");
            assertThat(text).contains("Соколова Анна Дмитриевна");
            assertThat(text).contains("Ведущий разработчик Java");
            assertThat(text).contains("Внутренний курс");
            assertThat(text).contains("Промежуточная проверка");

            assertThat(document.getTables()).hasSize(1);
            XWPFTable table = document.getTables().get(0);
            assertThat(table.getRow(0).getCell(0).getText()).isEqualTo("Приоритет");
            assertThat(table.getRow(0).getCell(2).getText()).isEqualTo("Что развиваем?");
            assertThat(table.getRow(1).getCell(1).getText()).isEqualTo("Цель по SMART до 31.12.2026");
            assertThat(table.getRow(1).getCell(2).getText())
                    .isEqualTo("Проектирование компонентов и API");
        }
    }

    @Test
    void пустой_план_экспортируется_без_ошибок() {
        IdpView view = new IdpView(1L, LocalDate.now(), "DRAFT", "emp-001", "Сотрудник", "Руководитель",
                "Должность", "Роль", List.of());

        assertThat(exporter.export(view)).isNotEmpty();
    }
}
