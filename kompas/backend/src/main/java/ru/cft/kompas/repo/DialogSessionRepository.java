package ru.cft.kompas.repo;

import org.springframework.data.jpa.repository.JpaRepository;
import ru.cft.kompas.domain.DialogSession;

public interface DialogSessionRepository extends JpaRepository<DialogSession, Long> {
}
