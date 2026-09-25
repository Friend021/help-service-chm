package ru.cft.kompas.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;
import ru.cft.kompas.rag.ReferenceIndexer;
import ru.cft.kompas.rag.VectorStore;
import ru.cft.kompas.reference.ReferenceSeeder;

/** Сид демо-справочников и построение RAG-индекса при старте. */
@Component
public class StartupRunner implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(StartupRunner.class);

    private final ReferenceSeeder seeder;
    private final ReferenceIndexer indexer;
    private final VectorStore vectorStore;

    public StartupRunner(ReferenceSeeder seeder, ReferenceIndexer indexer, VectorStore vectorStore) {
        this.seeder = seeder;
        this.indexer = indexer;
        this.vectorStore = vectorStore;
    }

    @Override
    public void run(ApplicationArguments args) {
        boolean seeded = seeder.seedIfEmpty();

        vectorStore.refresh();
        if (seeded || vectorStore.size() == 0) {
            indexer.reindex();
        }

        log.info("«Компас» готов: фрагментов в RAG-индексе {}", vectorStore.size());
    }
}
