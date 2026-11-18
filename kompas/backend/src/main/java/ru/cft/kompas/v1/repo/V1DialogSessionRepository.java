package ru.cft.kompas.v1.repo;

import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import ru.cft.kompas.domain.DialogSession;
import ru.cft.kompas.domain.SessionStatus;

/** Поиск активной сессии сотрудника для слоя /api/v1 (легаси-репозиторий такого метода не имеет). */
public interface V1DialogSessionRepository extends JpaRepository<DialogSession, Long> {

    Optional<DialogSession> findFirstByEmployeeIdAndStatusOrderByIdDesc(Long employeeId, SessionStatus status);
}
