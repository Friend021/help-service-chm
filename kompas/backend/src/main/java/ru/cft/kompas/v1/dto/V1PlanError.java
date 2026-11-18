package ru.cft.kompas.v1.dto;

/** Ошибка валидации плана: путь до поля и человекочитаемое сообщение (как formatIssues мока). */
public record V1PlanError(String path, String message) {
}
