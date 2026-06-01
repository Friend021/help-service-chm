package com.chmviewer.service;

import com.chmviewer.model.TocEntry;
import lombok.extern.slf4j.Slf4j;
import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;
import org.jsoup.select.Elements;
import org.springframework.stereotype.Service;

import java.io.File;
import java.io.IOException;
import java.nio.charset.Charset;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.List;

/**
 * Parses HHC (HTML Help Contents) files into a TocEntry tree.
 * HHC is a proprietary HTML format used in CHM files for the table of contents.
 */
@Slf4j
@Service
public class TocParserService {

    public List<TocEntry> parse(File hhcFile) {
        try {
            // Detect charset: UTF-8 BOM or XML declaration; fall back to windows-1252 for real CHM files
            String charsetName = detectCharset(hhcFile);
            Document doc = Jsoup.parse(hhcFile, charsetName);
            // Top-level UL contains root items
            Element topUl = doc.selectFirst("body > ul, body > UL");
            if (topUl == null) {
                topUl = doc.selectFirst("ul");
            }
            if (topUl == null) {
                return List.of();
            }
            return parseUl(topUl);
        } catch (IOException e) {
            log.warn("Failed to parse HHC file {}: {}", hhcFile.getName(), e.getMessage());
            return List.of();
        }
    }

    private String detectCharset(File file) {
        try {
            byte[] header = Files.readAllBytes(file.toPath());
            // UTF-8 BOM
            if (header.length >= 3 && (header[0] & 0xFF) == 0xEF && (header[1] & 0xFF) == 0xBB && (header[2] & 0xFF) == 0xBF) {
                return "UTF-8";
            }
            // Look for charset declaration in the HTML header
            String headerAscii = new String(header, 0, Math.min(header.length, 2048), java.nio.charset.StandardCharsets.ISO_8859_1).toLowerCase();
            int csIdx = headerAscii.indexOf("charset=");
            if (csIdx >= 0) {
                String rest = headerAscii.substring(csIdx + 8).replaceAll("[\"'\\s]", "");
                int end = rest.indexOf('>');
                if (end < 0) end = rest.length();
                String declared = rest.substring(0, Math.min(end, 32)).trim();
                if (!declared.isEmpty()) {
                    try { Charset.forName(declared); return declared; } catch (Exception ignored) {}
                }
            }
            // Check for UTF-8 multi-byte sequences
            for (int i = 0; i < header.length - 1; i++) {
                int b = header[i] & 0xFF;
                int b2 = header[i+1] & 0xFF;
                if ((b >= 0xC0 && b <= 0xDF) && (b2 >= 0x80 && b2 <= 0xBF)) {
                    return "UTF-8";
                }
            }
        } catch (IOException ignored) {}
        return "windows-1251";
    }

    private List<TocEntry> parseUl(Element ul) {
        List<TocEntry> entries = new ArrayList<>();
        for (Element li : ul.children()) {
            if (!li.tagName().equalsIgnoreCase("li")) continue;

            Element obj = li.selectFirst("object[type=text/sitemap]");
            if (obj == null) continue;

            String name = getParam(obj, "Name");
            String local = getParam(obj, "Local");
            if (name == null || name.isBlank()) continue;

            TocEntry entry = new TocEntry(name.trim(), local != null ? local.trim() : null);

            // Look for nested ULs (children) — HHC may use one <UL> per chapter
            Elements childUls = li.select("> ul");
            if (!childUls.isEmpty()) {
                List<TocEntry> children = new ArrayList<>();
                for (Element childUl : childUls) {
                    children.addAll(parseUl(childUl));
                }
                entry.setChildren(children);
            }

            entries.add(entry);
        }
        return entries;
    }

    private String getParam(Element obj, String paramName) {
        for (Element param : obj.select("param")) {
            if (paramName.equalsIgnoreCase(param.attr("name"))) {
                return param.attr("value");
            }
        }
        return null;
    }
}
