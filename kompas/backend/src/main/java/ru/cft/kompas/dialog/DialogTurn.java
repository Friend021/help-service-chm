package ru.cft.kompas.dialog;

import ru.cft.kompas.domain.DialogStage;
import ru.cft.kompas.domain.Idp;

/** Результат хода диалога. */
public record DialogTurn(String assistantMessage, DialogStage stage, Idp idp) {
}
