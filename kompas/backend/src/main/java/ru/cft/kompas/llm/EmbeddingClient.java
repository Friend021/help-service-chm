package ru.cft.kompas.llm;

/** Абстракция получения эмбеддингов для RAG. */
public interface EmbeddingClient {

    float[] embed(String text);

    int dimension();

    String provider();
}
