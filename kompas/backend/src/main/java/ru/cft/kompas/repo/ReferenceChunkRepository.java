package ru.cft.kompas.repo;

import org.springframework.data.jpa.repository.JpaRepository;
import ru.cft.kompas.domain.ReferenceChunk;

public interface ReferenceChunkRepository extends JpaRepository<ReferenceChunk, Long> {
}
