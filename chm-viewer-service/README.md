# CHM Viewer Service

Микросервис для конвертации CHM-файлов справки в HTML и их отображения через браузер.

## Архитектура

```
chm-files/          ← сюда кладём .chm файлы (монтируемый том)
    └── manual.chm
converted/          ← кэш извлечённых HTML (создаётся автоматически)
    └── manual/
        ├── index.html
        ├── topic1.html
        └── images/
```

**Технологии:** Java 17 · Spring Boot 3.2 · 7-Zip (извлечение CHM) · Jsoup (парсинг HHC/TOC)

---

## Быстрый старт

### Предварительные требования

**7-Zip** — обязателен для конвертации CHM:
- Windows: [7-Zip](https://www.7-zip.org/) → укажи путь в `application.properties`
- Linux/Docker: `apt install p7zip-full` или `apk add p7zip`

### Запуск локально (Windows)

```bat
REM 1. Установи 7-Zip и проверь путь в src\main\resources\application.properties
REM    chm.seven-zip-path=C:/Program Files/7-Zip/7z.exe

REM 2. Собери и запусти
mvn spring-boot:run

REM 3. Открой браузер
start http://localhost:8085
```

### Запуск через Docker

```bash
docker-compose up -d
```

---

## Конфигурация

`src/main/resources/application.properties`:

| Параметр | По умолчанию | Описание |
|---|---|---|
| `chm.files-dir` | `./chm-files` | Директория с .chm файлами |
| `chm.converted-dir` | `./converted` | Кэш извлечённого HTML |
| `chm.seven-zip-path` | `7z` | Путь к 7-zip |
| `server.port` | `8085` | HTTP порт |

---

## API

| Метод | URL | Описание |
|---|---|---|
| `GET` | `/api/help` | Список всех книг (JSON) |
| `GET` | `/api/help/{book}/toc` | Оглавление (дерево или flat-список) |
| `GET` | `/api/help/{book}/default` | Redirect на начальную страницу |
| `GET` | `/help/{book}/{file}` | Отдача HTML/CSS/изображений |
| `POST` | `/api/refresh` | Пересканировать chm-files/ и конвертировать новые |

**UI:**
- `/` — список книг
- `/viewer.html?book=NAME` — просмотрщик с TOC и поиском
- `/viewer.html?book=NAME&page=topic.html` — открыть конкретную страницу

---

## Тестирование

### Вариант 1: Создать тестовый CHM (HTML Help Workshop)

```bat
cd test-data
create-sample-chm.bat
```

Требует [HTML Help Workshop](https://www.microsoft.com/en-us/download/details.aspx?id=21138).

### Вариант 2: Использовать системный CHM Windows

```bat
copy "C:\Windows\Help\mstsc.chm" chm-files\
```

После копирования нажми **↺ Refresh** или перезапусти сервис.

### Вариант 3: Использовать любой .chm файл

Скопируй любой `.chm` файл в папку `chm-files/` и выполни `/api/refresh`.

---

## Интеграция с веб-приложением

В основном веб-приложении добавляется кнопка справки в тулбар.
При клике открывается `/viewer.html?book=<bookName>` на порту 8085.

Для контекстной справки передавай параметр `page`:
```
http://localhost:8085/viewer.html?book=manual&page=features.html
```

Обработка `HelpObjectData` — пример в основном приложении:
```javascript
function openHelp(objectId) {
    const page = HELP_CONFIG.pageMap[objectId] || null;
    const url  = page
        ? `${HELP_CONFIG.serviceUrl}/viewer.html?book=${HELP_CONFIG.book}&page=${page}`
        : `${HELP_CONFIG.serviceUrl}/viewer.html?book=${HELP_CONFIG.book}`;
    window.open(url, 'help-window');
}
```
