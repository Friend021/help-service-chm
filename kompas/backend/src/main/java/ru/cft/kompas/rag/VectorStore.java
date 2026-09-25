package ru.cft.kompas.rag;

import java.util.List;
import ru.cft.kompas.domain.SourceType;

/**
 * Хранилище векторов справочников.
 * Текущая реализация — in-DB (вектор строкой) с косинусной близостью в памяти.
 * Переход на pgvector меняет только реализацию.
 */
public interface VectorStore {

    /** Перечитать индекс из БД. */
    void refresh();

    /**
     * @param query   вектор запроса
     * @param topK    сколько вернуть
     * @param type    фильтр по типу источника (null — без фильтра)
     * @param roleId  фильтр по роли (null — без фильтра)
     */
    List<RetrievedChunk> search(float[] query, int topK, SourceType type, Long roleId);

    int size();
}
