package ru.cft.kompas.api.dto;

import ru.cft.kompas.domain.DialogStage;

public record StageDto(String code, String title, int index, int total) {

    public static StageDto of(DialogStage stage) {
        return new StageDto(stage.name(), stage.getTitle(),
                stage.ordinal() + 1, DialogStage.values().length);
    }
}
