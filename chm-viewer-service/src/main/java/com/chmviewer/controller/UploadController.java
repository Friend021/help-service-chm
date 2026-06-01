package com.chmviewer.controller;

import com.chmviewer.config.ChmViewerProperties;
import com.chmviewer.model.ConvertedBook;
import com.chmviewer.service.ChmConversionService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.File;
import java.io.IOException;
import java.util.Map;

@Slf4j
@RestController
@RequiredArgsConstructor
public class UploadController {

    private final ChmConversionService conversionService;
    private final ChmViewerProperties props;

    @PostMapping("/api/upload")
    public ResponseEntity<?> upload(@RequestParam("file") MultipartFile file) {
        String originalName = file.getOriginalFilename();
        if (originalName == null || !originalName.toLowerCase().endsWith(".chm")) {
            return ResponseEntity.badRequest().body(Map.of("error", "Only .chm files are accepted"));
        }

        File dest = new File(props.getFilesDir(), originalName);
        try {
            file.transferTo(dest);
        } catch (IOException e) {
            log.error("Failed to save uploaded file {}: {}", originalName, e.getMessage());
            return ResponseEntity.internalServerError().body(Map.of("error", "Failed to save file: " + e.getMessage()));
        }

        log.info("Uploaded: {}", dest.getAbsolutePath());
        ConvertedBook book = conversionService.convertFile(dest);
        if (book == null || book.getStatus() == ConvertedBook.ConversionStatus.ERROR) {
            return ResponseEntity.internalServerError().body(Map.of("error", "Conversion failed for: " + originalName));
        }

        return ResponseEntity.ok(Map.of(
                "name", book.getName(),
                "status", book.getStatus().name(),
                "pages", book.getHtmlFiles() != null ? book.getHtmlFiles().size() : 0,
                "viewerUrl", "/viewer.html?book=" + book.getName()
        ));
    }
}
