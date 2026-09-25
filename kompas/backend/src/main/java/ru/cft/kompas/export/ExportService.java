package ru.cft.kompas.export;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import org.springframework.stereotype.Service;
import ru.cft.kompas.domain.Idp;

/** Экспорт ИПР в JSON и DOCX. */
@Service
public class ExportService {

    private final IdpViewAssembler assembler;
    private final DocxExporter docxExporter;
    private final ObjectMapper objectMapper;

    public ExportService(IdpViewAssembler assembler, DocxExporter docxExporter, ObjectMapper objectMapper) {
        this.assembler = assembler;
        this.docxExporter = docxExporter;
        this.objectMapper = objectMapper;
    }

    public Export export(Idp idp, String format) {
        IdpView view = assembler.assemble(idp);
        String normalized = format == null ? "docx" : format.toLowerCase();

        return switch (normalized) {
            case "json" -> new Export(json(view),
                    "application/json",
                    fileName(view, "json"));
            case "docx" -> new Export(docxExporter.export(view),
                    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                    fileName(view, "docx"));
            default -> throw new IllegalArgumentException("Неподдерживаемый формат экспорта: " + format);
        };
    }

    private byte[] json(IdpView view) {
        try {
            return objectMapper.writerWithDefaultPrettyPrinter()
                    .writeValueAsString(view)
                    .getBytes(StandardCharsets.UTF_8);
        } catch (Exception e) {
            throw new IllegalStateException("Не удалось сформировать JSON", e);
        }
    }

    private String fileName(IdpView view, String extension) {
        return "IPR_" + view.id() + "." + extension;
    }

    public record Export(byte[] content, String contentType, String fileName) {
    }
}
