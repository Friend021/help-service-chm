package com.chmviewer.controller;

import com.chmviewer.config.ChmViewerProperties;
import com.chmviewer.model.ConvertedBook;
import com.chmviewer.service.ChmConversionService;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.io.File;
import java.io.IOException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Slf4j
@RestController
@RequiredArgsConstructor
@CrossOrigin(origins = "*")
public class HelpController {

    private final ChmConversionService conversionService;
    private final ChmViewerProperties props;

    // ── List all books ──────────────────────────────────────────────────────

    @GetMapping("/api/help")
    public List<Map<String, Object>> listBooks() {
        return conversionService.getAllBooks().stream()
                .map(b -> Map.<String, Object>of(
                        "name", b.getName(),
                        "status", b.getStatus().name(),
                        "pages", b.getHtmlFiles() != null ? b.getHtmlFiles().size() : 0,
                        "hasToc", b.getToc() != null && !b.getToc().isEmpty(),
                        "viewerUrl", "/viewer.html?book=" + URLEncoder.encode(b.getName(), StandardCharsets.UTF_8),
                        "lastModified", b.getDirectory().lastModified()
                ))
                .collect(Collectors.toList());
    }

    // ── TOC for a book ──────────────────────────────────────────────────────

    @GetMapping("/api/help/{book}/toc")
    public ResponseEntity<?> getToc(@PathVariable String book) {
        return conversionService.getBook(book)
                .map(b -> {
                    if (b.getToc() == null || b.getToc().isEmpty()) {
                        // Fallback: return flat file list
                        return ResponseEntity.ok((Object) Map.of(
                                "type", "flat",
                                "files", b.getHtmlFiles() != null ? b.getHtmlFiles() : List.of()
                        ));
                    }
                    return ResponseEntity.ok((Object) Map.of(
                            "type", "tree",
                            "entries", b.getToc()
                    ));
                })
                .orElse(ResponseEntity.notFound().build());
    }

    // ── Default topic redirect ──────────────────────────────────────────────

    @GetMapping("/api/help/{book}/default")
    public ResponseEntity<Void> defaultTopic(@PathVariable String book) {
        var bookOpt = conversionService.getBook(book);
        if (bookOpt.isEmpty()) return ResponseEntity.<Void>notFound().build();
        String topic = bookOpt.get().getDefaultTopic();
        if (topic == null) return ResponseEntity.<Void>notFound().build();
        String encodedBook = URLEncoder.encode(book, StandardCharsets.UTF_8).replace("+", "%20");
        String encodedTopic = URLEncoder.encode(topic, StandardCharsets.UTF_8).replace("+", "%20");
        return ResponseEntity.<Void>status(302)
                .header("Location", "/help/" + encodedBook + "/" + encodedTopic)
                .build();
    }

    // ── Delete a book ───────────────────────────────────────────────────────

    @DeleteMapping("/api/help/{book}")
    public ResponseEntity<?> deleteBook(@PathVariable String book) {
        boolean deleted = conversionService.deleteBook(book);
        if (!deleted) return ResponseEntity.notFound().build();
        return ResponseEntity.ok(Map.of("status", "deleted", "name", book));
    }

    // ── Trigger re-scan & convert ───────────────────────────────────────────

    @PostMapping("/api/refresh")
    public ResponseEntity<String> refresh() {
        conversionService.convertAll();
        return ResponseEntity.ok("{\"status\":\"ok\",\"books\":" + conversionService.getAllBooks().size() + "}");
    }

    // ── Serve extracted HTML files ──────────────────────────────────────────

    @GetMapping("/help/{book}/**")
    public ResponseEntity<Resource> serveFile(
            @PathVariable String book,
            HttpServletRequest request) {

        // getServletPath() returns the already-decoded path, avoiding %20 vs space mismatch
        String servletPath = request.getServletPath();
        String prefix = "/help/" + book + "/";
        if (!servletPath.startsWith(prefix)) {
            return ResponseEntity.<Resource>badRequest().build();
        }
        String filePath = servletPath.substring(prefix.length());

        // Strip leading slashes (some CHM paths start with /)
        while (filePath.startsWith("/")) filePath = filePath.substring(1);

        var bookOpt = conversionService.getBook(book);
        if (bookOpt.isEmpty()) return ResponseEntity.<Resource>notFound().build();
        ConvertedBook b = bookOpt.get();

        File file = new File(b.getDirectory(), filePath);

        // Path traversal guard
        try {
            String canonical = file.getCanonicalPath();
            String base = b.getDirectory().getCanonicalPath();
            if (!canonical.startsWith(base)) {
                log.warn("Path traversal attempt: {}", filePath);
                return ResponseEntity.<Resource>badRequest().build();
            }
        } catch (IOException e) {
            return ResponseEntity.<Resource>status(500).build();
        }

        if (!file.exists() || !file.isFile()) {
            File index = new File(file, "index.html");
            if (!index.exists()) return ResponseEntity.<Resource>notFound().build();
            file = index;
        }

        MediaType type = mediaType(filePath);
        return ResponseEntity.ok()
                .contentType(type)
                .body((Resource) new FileSystemResource(file));
    }

    // ── Root redirect ───────────────────────────────────────────────────────

    @GetMapping("/help/{book}")
    public ResponseEntity<Void> redirectBook(@PathVariable String book) {
        return ResponseEntity.status(302)
                .header("Location", "/viewer.html?book=" + URLEncoder.encode(book, StandardCharsets.UTF_8))
                .build();
    }

    // ── Media type resolution ───────────────────────────────────────────────

    private MediaType mediaType(String path) {
        String lower = path.toLowerCase();
        if (lower.endsWith(".html") || lower.endsWith(".htm")) return MediaType.TEXT_HTML;
        if (lower.endsWith(".css"))  return MediaType.valueOf("text/css");
        if (lower.endsWith(".js"))   return MediaType.valueOf("application/javascript");
        if (lower.endsWith(".png"))  return MediaType.IMAGE_PNG;
        if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return MediaType.IMAGE_JPEG;
        if (lower.endsWith(".gif"))  return MediaType.IMAGE_GIF;
        if (lower.endsWith(".svg"))  return MediaType.valueOf("image/svg+xml");
        if (lower.endsWith(".ico"))  return MediaType.valueOf("image/x-icon");
        if (lower.endsWith(".xml"))  return MediaType.APPLICATION_XML;
        if (lower.endsWith(".json")) return MediaType.APPLICATION_JSON;
        if (lower.endsWith(".pdf"))  return MediaType.APPLICATION_PDF;
        return MediaType.APPLICATION_OCTET_STREAM;
    }
}
