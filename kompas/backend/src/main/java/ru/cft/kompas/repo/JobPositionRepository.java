package ru.cft.kompas.repo;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import ru.cft.kompas.domain.JobPosition;

public interface JobPositionRepository extends JpaRepository<JobPosition, Long> {

    Optional<JobPosition> findByTitleIgnoreCase(String title);

    List<JobPosition> findByCareerTrack(String careerTrack);
}
