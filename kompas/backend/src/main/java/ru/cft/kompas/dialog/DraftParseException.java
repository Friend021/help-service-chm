package ru.cft.kompas.dialog;

public class DraftParseException extends RuntimeException {

    public DraftParseException(String message) {
        super(message);
    }

    public DraftParseException(String message, Throwable cause) {
        super(message, cause);
    }
}
