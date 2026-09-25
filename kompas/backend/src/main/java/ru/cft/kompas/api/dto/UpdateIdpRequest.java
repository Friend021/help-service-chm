package ru.cft.kompas.api.dto;

import java.util.List;
import ru.cft.kompas.dialog.DraftDto;

/** Ручная правка черновика из панели ИПР. */
public record UpdateIdpRequest(List<DraftDto.PriorityDto> priorities) {
}
