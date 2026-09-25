package ru.cft.kompas.repo;

import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import ru.cft.kompas.domain.Idp;

public interface IdpRepository extends JpaRepository<Idp, Long> {

    Optional<Idp> findBySessionId(Long sessionId);
}
