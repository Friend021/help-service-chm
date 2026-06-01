package com.chmviewer.service;

import com.chmviewer.config.ChmViewerProperties;
import com.chmviewer.model.ConvertedBook;
import com.chmviewer.model.ConvertedBook.ConversionStatus;
import com.chmviewer.model.TocEntry;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.Comparator;
import java.util.stream.Collectors;
import java.util.stream.Stream;

@Slf4j
@Service
@RequiredArgsConstructor
public class ChmConversionService {

    private final ChmViewerProperties props;
    private final TocParserService tocParser;

    private final Map<String, ConvertedBook> books = new ConcurrentHashMap<>();

    @PostConstruct
    public void init() {
        File chmDir = new File(props.getFilesDir());
        if (!chmDir.exists()) {
            chmDir.mkdirs();
            log.info("Created CHM input directory: {}", chmDir.getAbsolutePath());
        }
        new File(props.getConvertedDir()).mkdirs();
        convertAll();
    }

    public synchronized void convertAll() {
        File chmDir = new File(props.getFilesDir());
        File[] chmFiles = chmDir.listFiles((d, name) -> name.toLowerCase().endsWith(".chm"));
        if (chmFiles == null || chmFiles.length == 0) {
            log.info("No CHM files found in {}", chmDir.getAbsolutePath());
            return;
        }
        for (File f : chmFiles) {
            convertAndIndex(f);
        }
    }

    private void convertAndIndex(File chmFile) {
        String bookName = stripExtension(chmFile.getName());
        File outputDir = new File(props.getConvertedDir(), bookName);
        outputDir.mkdirs();

        ConvertedBook book = new ConvertedBook(bookName, outputDir);
        books.put(bookName, book);

        // Skip extraction if already done (has HTML files)
        boolean alreadyExtracted = hasHtmlFiles(outputDir);
        if (!alreadyExtracted) {
            log.info("Extracting {} ...", chmFile.getName());
            boolean ok = extract(chmFile, outputDir);
            if (!ok) {
                book.setStatus(ConversionStatus.ERROR);
                log.error("Extraction failed for: {}", chmFile.getName());
                return;
            }
            log.info("Extracted {} -> {}", chmFile.getName(), outputDir.getAbsolutePath());
        } else {
            log.info("Using cached extraction for: {}", bookName);
        }

        indexBook(book);
    }

    private boolean extract(File chmFile, File outputDir) {
        try {
            List<String> cmd = new ArrayList<>();
            cmd.add(props.getSevenZipPath());
            cmd.add("x");
            cmd.add(chmFile.getAbsolutePath());
            cmd.add("-o" + outputDir.getAbsolutePath());
            cmd.add("-y");          // overwrite all
            cmd.add("-aou");        // auto rename on conflict

            ProcessBuilder pb = new ProcessBuilder(cmd);
            pb.redirectErrorStream(true);
            Process proc = pb.start();
            String output = new String(proc.getInputStream().readAllBytes());
            int exit = proc.waitFor();

            if (exit != 0) {
                log.error("7-zip exited with code {}: {}", exit, output);
                return false;
            }
            return true;
        } catch (IOException e) {
            log.error("Could not run 7-zip (path='{}'): {}. " +
                    "Install 7-Zip and set chm.seven-zip-path in application.properties.",
                    props.getSevenZipPath(), e.getMessage());
            return false;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return false;
        }
    }

    private void indexBook(ConvertedBook book) {
        File dir = book.getDirectory();

        // Find TOC file (.hhc)
        findFile(dir, ".hhc").ifPresent(hhc -> {
            List<TocEntry> toc = tocParser.parse(hhc);
            book.setToc(toc);
            log.debug("TOC loaded for '{}': {} root entries", book.getName(), toc.size());
        });

        // Collect HTML files (relative paths)
        List<String> htmlFiles = collectHtmlFiles(dir);
        book.setHtmlFiles(htmlFiles);

        // Determine default topic
        book.setDefaultTopic(resolveDefaultTopic(dir, book.getToc()));

        book.setStatus(ConversionStatus.READY);
        log.info("Book '{}' ready. Default: '{}', pages: {}", book.getName(), book.getDefaultTopic(), htmlFiles.size());
    }

    private String resolveDefaultTopic(File dir, List<TocEntry> toc) {
        // 1. First entry in TOC with a local path
        if (toc != null && !toc.isEmpty()) {
            String first = firstLocal(toc);
            if (first != null && new File(dir, first).exists()) return first;
        }
        // 2. Common entry-point file names
        for (String candidate : List.of("index.html", "index.htm", "default.html", "default.htm",
                "start.html", "home.html", "welcome.html", "contents.html")) {
            if (new File(dir, candidate).exists()) return candidate;
        }
        // 3. First HTML file found
        return collectHtmlFiles(dir).stream().findFirst().orElse(null);
    }

    private String firstLocal(List<TocEntry> entries) {
        for (TocEntry e : entries) {
            if (e.getLocal() != null && !e.getLocal().isBlank()) return e.getLocal();
            String child = firstLocal(e.getChildren());
            if (child != null) return child;
        }
        return null;
    }

    private List<String> collectHtmlFiles(File dir) {
        try (Stream<Path> stream = Files.walk(dir.toPath())) {
            return stream
                    .filter(Files::isRegularFile)
                    .filter(p -> {
                        String n = p.getFileName().toString().toLowerCase();
                        return n.endsWith(".html") || n.endsWith(".htm");
                    })
                    .map(p -> dir.toPath().relativize(p).toString().replace('\\', '/'))
                    .sorted()
                    .collect(Collectors.toList());
        } catch (IOException e) {
            return List.of();
        }
    }

    private Optional<File> findFile(File dir, String extension) {
        try (Stream<Path> stream = Files.walk(dir.toPath())) {
            return stream
                    .filter(Files::isRegularFile)
                    .filter(p -> p.getFileName().toString().toLowerCase().endsWith(extension))
                    .map(Path::toFile)
                    .findFirst();
        } catch (IOException e) {
            return Optional.empty();
        }
    }

    private boolean hasHtmlFiles(File dir) {
        File[] files = dir.listFiles(f -> f.isFile() && f.getName().toLowerCase().endsWith(".html"));
        return files != null && files.length > 0;
    }

    private String stripExtension(String name) {
        int dot = name.lastIndexOf('.');
        return dot > 0 ? name.substring(0, dot) : name;
    }

    // ── Public API ─────────────────────────────────────────────────────────

    public Collection<ConvertedBook> getAllBooks() {
        return books.values();
    }

    public Optional<ConvertedBook> getBook(String name) {
        return Optional.ofNullable(books.get(name));
    }

    public synchronized ConvertedBook convertFile(File chmFile) {
        convertAndIndex(chmFile);
        String bookName = stripExtension(chmFile.getName());
        return books.get(bookName);
    }

    public synchronized boolean deleteBook(String name) {
        ConvertedBook book = books.remove(name);
        if (book == null) return false;

        // Delete extracted files
        deleteDir(book.getDirectory());

        // Delete original CHM
        File chm = new File(props.getFilesDir(), name + ".chm");
        if (chm.exists()) chm.delete();

        log.info("Deleted book '{}'", name);
        return true;
    }

    private void deleteDir(File dir) {
        if (dir == null || !dir.exists()) return;
        try (Stream<Path> stream = Files.walk(dir.toPath())) {
            stream.sorted(Comparator.reverseOrder())
                  .map(Path::toFile)
                  .forEach(File::delete);
        } catch (IOException e) {
            log.warn("Failed to delete directory {}: {}", dir, e.getMessage());
        }
    }
}
