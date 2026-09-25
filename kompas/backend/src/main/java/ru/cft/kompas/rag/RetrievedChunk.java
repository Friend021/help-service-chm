package ru.cft.kompas.rag;

import ru.cft.kompas.domain.SourceType;

/** Найденный фрагмент справочника с оценкой релевантности. */
public record RetrievedChunk(Long id,
                             SourceType sourceType,
                             String sourceRef,
                             String code,
                             String text,
                             double score) {
}
