package ru.cft.kompas.repo;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import ru.cft.kompas.domain.Competency;

public interface CompetencyRepository extends JpaRepository<Competency, Long> {

    List<Competency> findByRoleIdOrderByCodeAsc(Long roleId);

    Optional<Competency> findByCode(String code);

    List<Competency> findByCodeIn(List<String> codes);
}
