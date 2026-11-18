package ru.cft.kompas.v1.api;

import java.util.List;
import ru.cft.kompas.v1.dto.V1PlanError;

/** План не прошёл валидацию «полноты» при экспорте — ответ 422 через v1-advice. */
public class V1PlanInvalidException extends RuntimeException {

    private final transient List<V1PlanError> errors;

    public V1PlanInvalidException(List<V1PlanError> errors) {
        super("План не прошёл валидацию контракта «План развития»");
        this.errors = errors;
    }

    public List<V1PlanError> errors() {
        return errors;
    }
}
