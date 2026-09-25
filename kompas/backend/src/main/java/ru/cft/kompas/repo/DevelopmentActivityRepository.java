package ru.cft.kompas.repo;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import ru.cft.kompas.domain.DevelopmentActivity;

public interface DevelopmentActivityRepository extends JpaRepository<DevelopmentActivity, Long> {

    Optional<DevelopmentActivity> findByCode(String code);

    List<DevelopmentActivity> findByCodeIn(List<String> codes);
}
