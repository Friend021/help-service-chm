# CHM Viewer Service + Navigator v3

Решение для отображения CHM-файлов справки в браузере без установки дополнительного ПО у пользователя. Состоит из двух сервисов, каждый запускается в Docker-контейнере.

```
┌─────────────────────────────────────────────────────────┐
│  Браузер пользователя                                   │
└──────────┬──────────────────────────┬───────────────────┘
           │                          │
    порт 8080                   порт 8085
           │                          │
┌──────────▼──────────┐   ┌───────────▼──────────────────┐
│   Navigator v3      │   │   CHM Viewer Service         │
│   nginx:alpine      │──▶│   Java 17 + Spring Boot 3.2  │
│   React SPA (CDN)   │   │   7-Zip + Jsoup              │
└─────────────────────┘   └──────────────────────────────┘
```

---

## Структура проекта

```
Project/
├── chm-viewer-service/     ← Основной сервис конвертации и просмотра
│   ├── src/
│   ├── chm-files/          ← Сюда кладём .chm файлы (Docker volume)
│   ├── converted/          ← Кэш извлечённого HTML (создаётся автоматически)
│   ├── Dockerfile
│   ├── docker-compose.yml
│   └── pom.xml
├── navigator/              ← Веб-приложение с интеграцией кнопки справки
│   ├── index.html
│   ├── Dockerfile
│   ├── docker-compose.yml
│   ├── entrypoint.sh
│   └── nginx.conf
└── Navigator v3.html       ← Исходник Navigator (без Docker, для разработки)
```

---

## Требования

| Инструмент | Версия | Назначение |
|---|---|---|
| Docker Desktop | 24+ | Запуск контейнеров |
| Git | любая | Клонирование репозитория |

> **Важно для Windows:** Hyper-V должен быть включён. Без него WSL2 не резолвит DNS и Docker не может скачивать образы.
> Проверить: Панель управления → Программы → Компоненты Windows → Hyper-V ✅

---

## Быстрый старт

### 1. Клонировать репозиторий

```bash
git clone https://github.com/ТВО_ИМЯ/chm-viewer.git
cd chm-viewer
```

### 2. Настроить DNS в Docker (один раз)

Docker Desktop → Settings → Docker Engine — добавить в JSON:

```json
{
  "dns": ["8.8.8.8", "8.8.4.4"]
}
```

Нажать **Apply & Restart**.

### 3. Запустить CHM Viewer Service

```powershell
cd chm-viewer-service
docker-compose up -d --build
```

Сервис будет доступен на http://localhost:8085

### 4. Запустить Navigator

```powershell
cd ..\navigator
docker-compose up -d --build
```

Navigator будет доступен на http://localhost:8080

---

## Использование

### Загрузить справку (CHM-файл)

1. Открыть http://localhost:8085
2. Нажать **+ Upload**
3. Перетащить `.chm` файл или выбрать через диалог
4. Дождаться конвертации (статус READY)

### Просмотр справки

- **Напрямую:** http://localhost:8085 → кликнуть на книгу
- **Из Navigator:** http://localhost:8080 → кнопка `?` в правом верхнем углу

Кнопка `?` в Navigator автоматически открывает последнюю загруженную книгу.

### Удаление книги

На странице http://localhost:8085 навести мышь на карточку книги → нажать 🗑

---

## Технологический стек

### CHM Viewer Service (`chm-viewer-service/`)

| Компонент | Технология | Лицензия |
|---|---|---|
| Сервер | Java 17 + Spring Boot 3.2 | Apache 2.0 |
| Сборка | Maven | Apache 2.0 |
| Извлечение CHM | 7-Zip (внешний процесс) | LGPL / GNU LGPL |
| Парсинг HHC (TOC) | Jsoup 1.17 | MIT |
| Контейнер (сборка) | maven:3.9-eclipse-temurin-17 | Apache 2.0 |
| Контейнер (runtime) | eclipse-temurin:17-jre-alpine | Apache 2.0 |

### Navigator (`navigator/`)

| Компонент | Технология | Лицензия |
|---|---|---|
| Веб-сервер | nginx:alpine | BSD |
| UI | React 18 + Babel (CDN) | MIT |
| Конфигурация | env-переменная + sed в entrypoint.sh | — |

---

## REST API

| Метод | URL | Описание |
|---|---|---|
| `GET` | `/api/help` | Список книг (JSON, включает `lastModified`) |
| `GET` | `/api/help/{book}/toc` | Оглавление: дерево (`type: tree`) или список (`type: flat`) |
| `GET` | `/api/help/{book}/default` | Redirect на стартовую страницу книги |
| `GET` | `/help/{book}/**` | Отдача HTML, CSS, изображений |
| `POST` | `/api/upload` | Загрузить `.chm` файл (multipart, max 512 МБ) |
| `POST` | `/api/refresh` | Пересканировать `chm-files/` и конвертировать новые |
| `DELETE` | `/api/help/{book}` | Удалить книгу (файлы + converted/) |

**UI страницы:**

| URL | Описание |
|---|---|
| `/` | Список всех загруженных книг |
| `/viewer.html?book=NAME` | Просмотрщик: TOC слева, содержимое справа |
| `/viewer.html?book=NAME&page=topic.html` | Открыть конкретную страницу |
| `/upload.html` | Загрузка нового CHM-файла |

---

## Конфигурация

`chm-viewer-service/src/main/resources/application.properties`:

```properties
server.port=8085
chm.files-dir=./chm-files
chm.converted-dir=./converted
chm.seven-zip-path=7z
spring.servlet.multipart.max-file-size=512MB
spring.servlet.multipart.max-request-size=512MB
```

`navigator/docker-compose.yml`:

```yaml
environment:
  - HELP_SERVICE_URL=http://localhost:8085
```

---

## Пересборка после изменений в коде

```powershell
cd chm-viewer-service
docker buildx build --progress=plain -t chm-viewer-service-chm-viewer:latest .
docker stop chm-viewer-service
docker rm chm-viewer-service
docker-compose up -d
```

---

## Установка на Astra Linux / Linux-сервер

Все зависимости находятся внутри Docker-образа — дополнительная установка не требуется.

```bash
# Установить Docker (если не установлен)
sudo apt update && sudo apt install -y docker.io docker-compose
sudo systemctl enable docker && sudo systemctl start docker

# Клонировать и запустить
git clone https://github.com/ТВО_ИМЯ/chm-viewer.git
cd chm-viewer

cd chm-viewer-service && docker-compose up -d --build
cd ../navigator && docker-compose up -d --build
```

> На Astra Linux 7-Zip устанавливается внутри Docker-образа через `apk add 7zip` — дополнительных действий не нужно.

---

## Типичные проблемы

| Проблема | Причина | Решение |
|---|---|---|
| `docker build` не тянет образы | Hyper-V выключен (Windows) | Включить Hyper-V, перезагрузить |
| `docker build` не тянет образы | Нет внешнего DNS | Добавить `8.8.8.8` в Docker Engine settings |
| Пустой iframe в просмотрщике | Пробелы в имени книги | Исправлено в текущей версии — использует `getServletPath()` |
| Кракозябры в TOC | Неверная кодировка HHC | Исправлено — автодетект + fallback на windows-1251 |
| Только первая глава в TOC | Нестандартный формат HHC | Исправлено — итерируем все дочерние `<UL>` |
| Контейнер уже существует | Старый контейнер не удалён | `docker stop <name> && docker rm <name>` |
