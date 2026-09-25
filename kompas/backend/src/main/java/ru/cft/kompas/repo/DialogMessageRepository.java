package ru.cft.kompas.repo;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import ru.cft.kompas.domain.DialogMessage;

public interface DialogMessageRepository extends JpaRepository<DialogMessage, Long> {

    List<DialogMessage> findBySessionIdOrderByIdAsc(Long sessionId);
}
