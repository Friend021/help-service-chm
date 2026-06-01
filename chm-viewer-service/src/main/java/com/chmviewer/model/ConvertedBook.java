package com.chmviewer.model;

import lombok.Data;
import java.io.File;
import java.util.List;

@Data
public class ConvertedBook {
    private final String name;
    private final File directory;
    private String defaultTopic;
    private List<TocEntry> toc;
    private List<String> htmlFiles;
    private ConversionStatus status;

    public enum ConversionStatus {
        CONVERTING, READY, ERROR
    }

    public ConvertedBook(String name, File directory) {
        this.name = name;
        this.directory = directory;
        this.status = ConversionStatus.CONVERTING;
    }
}
