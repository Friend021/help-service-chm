package com.chmviewer.model;

import lombok.Data;
import java.util.ArrayList;
import java.util.List;

@Data
public class TocEntry {
    private String name;
    private String local;        // relative path inside the book
    private List<TocEntry> children = new ArrayList<>();

    public TocEntry(String name, String local) {
        this.name = name;
        this.local = local;
    }
}
