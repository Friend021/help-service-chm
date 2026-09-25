package ru.cft.kompas.export;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.time.format.DateTimeFormatter;
import org.apache.poi.xwpf.usermodel.ParagraphAlignment;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.apache.poi.xwpf.usermodel.XWPFParagraph;
import org.apache.poi.xwpf.usermodel.XWPFRun;
import org.apache.poi.xwpf.usermodel.XWPFTable;
import org.apache.poi.xwpf.usermodel.XWPFTableRow;
import org.springframework.stereotype.Component;

/**
 * Экспорт ИПР в DOCX: три базовые колонки формы «ПЛАН РАЗВИТИЯ»
 * плюс секции активностей и реперных точек.
 */
@Component
public class DocxExporter {

    private static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("dd.MM.yyyy");
    private static final String TEAL = "1F6E80";

    public byte[] export(IdpView view) {
        try (XWPFDocument document = new XWPFDocument();
             ByteArrayOutputStream output = new ByteArrayOutputStream()) {

            title(document, "Индивидуальный план развития");

            meta(document, "Дата составления", view.date() == null ? "" : view.date().format(DATE));
            meta(document, "Сотрудник", nvl(view.employeeName()));
            meta(document, "Руководитель", nvl(view.managerName()));
            meta(document, "Текущая должность", nvl(view.currentPosition()));
            meta(document, "Целевая роль", nvl(view.targetRole()));
            meta(document, "Статус", nvl(view.status()));

            heading(document, "Приоритеты развития");
            prioritiesTable(document, view);

            // Под каждой целью — своя таблица «как развиваем», как в самой форме
            for (IdpView.PriorityView priority : view.priorities()) {
                heading(document, "Приоритет " + priority.order() + ". " + competencyNames(priority));
                if (priority.actions().isEmpty()) {
                    plain(document.createParagraph(), "Развивающие действия не заданы.");
                    continue;
                }
                actionsTable(document, priority);
            }

            document.write(output);
            return output.toByteArray();
        } catch (IOException e) {
            throw new IllegalStateException("Не удалось сформировать DOCX", e);
        }
    }

    private void prioritiesTable(XWPFDocument document, IdpView view) {
        XWPFTable table = document.createTable(view.priorities().size() + 1, 3);
        table.setWidth("100%");

        XWPFTableRow head = table.getRow(0);
        headerCell(head, 0, "Приоритет");
        headerCell(head, 1, "Цели по развитию");
        headerCell(head, 2, "Что развиваем?");

        int rowIndex = 1;
        for (IdpView.PriorityView priority : view.priorities()) {
            XWPFTableRow row = table.getRow(rowIndex++);
            cell(row, 0, String.valueOf(priority.order()));
            // В форме это выпадающий список: сначала категория, под ней — сама цель
            cell(row, 1, priority.goalCategory() == null || priority.goalCategory().isBlank()
                    ? priority.developmentGoal()
                    : priority.goalCategory() + "\n" + priority.developmentGoal());
            cell(row, 2, priority.competencies().isEmpty()
                    ? ""
                    : String.join("; ", priority.competencies().stream()
                            .map(IdpView.NamedRef::name).toList()));
        }
    }

    /** Таблица развивающих действий приоритета — колонки как в форме. */
    private void actionsTable(XWPFDocument document, IdpView.PriorityView priority) {
        XWPFTable table = document.createTable(priority.actions().size() + 1, 5);
        table.setWidth("100%");

        XWPFTableRow head = table.getRow(0);
        headerCell(head, 0, "№");
        headerCell(head, 1, "Инструмент развития");
        headerCell(head, 2, "Конкретное действие");
        headerCell(head, 3, "Планируемый срок");
        headerCell(head, 4, "Статус выполнения");

        int rowIndex = 1;
        int number = 1;
        for (IdpView.ActionView action : priority.actions()) {
            XWPFTableRow row = table.getRow(rowIndex++);
            cell(row, 0, String.valueOf(number++));
            cell(row, 1, nvl(action.instrument()));
            cell(row, 2, action.activityName() == null
                    ? nvl(action.action())
                    : action.action() + "\n" + action.activityName()
                            + (action.source() == null ? "" : " (" + action.source() + ")"));
            cell(row, 3, nvl(action.dueDate()));
            cell(row, 4, nvl(action.status()));
        }
    }

    private static String competencyNames(IdpView.PriorityView priority) {
        return priority.competencies().isEmpty()
                ? nvl(priority.goalCategory())
                : String.join("; ", priority.competencies().stream()
                        .map(IdpView.NamedRef::name).toList());
    }

    private void headerCell(XWPFTableRow row, int index, String text) {
        row.getCell(index).setColor("F5F5F5");
        XWPFParagraph paragraph = row.getCell(index).getParagraphs().get(0);
        bold(paragraph, text);
    }

    private void cell(XWPFTableRow row, int index, String text) {
        XWPFParagraph paragraph = row.getCell(index).getParagraphs().get(0);
        // POI не переносит строки сам: каждый перевод строки — отдельный break
        String[] lines = (text == null ? "" : text).split("\n", -1);
        XWPFRun run = paragraph.createRun();
        for (int i = 0; i < lines.length; i++) {
            if (i > 0) {
                run.addBreak();
            }
            run.setText(lines[i]);
        }
    }

    private void title(XWPFDocument document, String text) {
        XWPFParagraph paragraph = document.createParagraph();
        paragraph.setAlignment(ParagraphAlignment.CENTER);
        XWPFRun run = paragraph.createRun();
        run.setText(text);
        run.setBold(true);
        run.setFontSize(16);
        run.setColor(TEAL);
        paragraph.setSpacingAfter(240);
    }

    private void heading(XWPFDocument document, String text) {
        XWPFParagraph paragraph = document.createParagraph();
        paragraph.setSpacingBefore(320);
        paragraph.setSpacingAfter(120);
        XWPFRun run = paragraph.createRun();
        run.setText(text);
        run.setBold(true);
        run.setFontSize(13);
        run.setColor(TEAL);
    }

    private void meta(XWPFDocument document, String label, String value) {
        XWPFParagraph paragraph = document.createParagraph();
        paragraph.setSpacingAfter(0);
        XWPFRun labelRun = paragraph.createRun();
        labelRun.setText(label + ": ");
        labelRun.setBold(true);
        labelRun.setColor(TEAL);
        XWPFRun valueRun = paragraph.createRun();
        valueRun.setText(value);
    }

    private void bold(XWPFParagraph paragraph, String text) {
        XWPFRun run = paragraph.createRun();
        run.setText(text);
        run.setBold(true);
    }

    private void plain(XWPFParagraph paragraph, String text) {
        XWPFRun run = paragraph.createRun();
        run.setText(text);
    }

    private static String nvl(String value) {
        return value == null ? "" : value;
    }
}
