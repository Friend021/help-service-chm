# Compass — дизайн фронтенда

Минимальный каркас интерфейса на Angular. Вёрстка воспроизводит дизайн-систему и
ключевые «вехи» (landmarks) смежного проекта из пакета `@cft/ui-lib`
(`package/` рядом с этим проектом).

## Стек

- **Angular 22** (standalone-компоненты, сигналы, встроенный control flow `@if/@for`)
- **TypeScript** (strict), **SCSS**
- Без сторонних UI-библиотек — только CSS и дизайн-токены (переменные `:root`)

## Структура

```
frontend/src/
├── styles.scss                  # глобальные токены, шрифты, сброс
├── app/
│   ├── app.ts / app.html        # корневой компонент + данные демо
│   ├── app.routes.ts            # роуты (главная + catch-all)
│   ├── layout/                  # «вехи» интерфейса (standalone)
│   │   ├── common-header/       # шапка №1 (глобальная, сверху)
│   │   ├── page-header/         # шапка №2 (логотип + заголовок + навигация)
│   │   ├── side-panel/          # правая панель
│   │   ├── app-footer/          # нижний футер
│   │   ├── app-shell/           # собирает всё в общий каркас
│   │   └── menu-item.ts         # тип MenuItem
│   └── pages/home/              # демо-страница основного контента
└── public/assets/               # иконки и шрифты (из @cft/ui-lib)
```

## Дизайн-токены

Все значения лежат в `src/styles.scss` как CSS-переменные.

### Цвета

| Токен | Значение | Назначение |
| --- | --- | --- |
| `--primary-500` / `--primary` | `#0961A4` | основной синий |
| `--tertiary-600` | `#3C4858` | фон шапки №1 |
| `--warn-500` / `--error-color` | `#BA1A1A` | ошибки / бейджи задач |
| `--background-color` | `#F5F5F5` | фон контента |
| `--surface-color` | `#FFFFFF` | поверхность (карточки, панель, футер) |
| `--outline-color` | `rgba(0,0,0,.12)` | границы/разделители |
| `--surface-overlay-color` | `rgba(33,33,33,.08)` | фон шапки №2 |
| `--on-surface-high-emphasis-color` | `rgba(0,0,0,.87)` | основной текст |
| `--on-surface-medium-emphasis-color` | `rgba(0,0,0,.60)` | вторичный текст |
| `--on-surface-disabled-color` | `rgba(0,0,0,.38)` | неактивный текст |

Полные палитры `primary` (10–900), `tertiary` (50–900) и `warn` (50–900)
перенесены из `theme.scss` пакета.

### Типографика

- Шрифты: **Inter-Regular** (основной) и **Inter-Medium** (заголовки/навигация),
  подключены через `@font-face` из `public/assets/font/`.
- Масштаб повторяет Material-уровни из пакета:
  - `28/32` — заголовок страницы (headline-4)
  - `20/28` — заголовок панели/шапки (headline-5)
  - `16/24` — заголовок карточки (headline-6)
  - `14/20` — основной текст (body-2)
  - `12/16` — подписи/футер (caption)

### Брейкпоинты

По умолчанию из `@cft/ui-lib/core` (`smallToMediumWidth: 600`,
`mediumToLargeWidth: 850`). В каркасе используются два ключевых режима:

| Режим | Ширина | Примечание |
| --- | --- | --- |
| Mobile | `< 600px` | шапка №1 — 44px, шапка №2 — 56px, навигация скрыта |
| Desktop | `>= 600px` | шапка №1 — 32px, шапка №2 — 60px, навигация видна |

## «Вехи» интерфейса (компоненты)

Все компоненты — standalone, используют сигналы (`input`, `computed`).

### 1. Шапка №1 — `app-common-header`

Глобальная верхняя полоса (аналог `common-header` из пакета).

| Вход | Тип | Описание |
| --- | --- | --- |
| `employee` | `string` (required) | имя сотрудника, отображается как «Фамилия И.» |
| `isAbsolutePositioning` | `boolean` | позиционировать поверх страницы |

Содержимое: иконка «все сервисы», логотип (на mobile — `mobile-logo.svg`),
инициалы сотрудника (только desktop), иконки профиля и уведомлений.

### 2. Шапка №2 — `app-page-header`

Шапка страницы (аналог `container-header` из `app-layout`).

| Вход | Тип | Описание |
| --- | --- | --- |
| `title` | `string` (required) | заголовок раздела |
| `logoSrc` | `string` (required) | путь к логотипу |
| `menuItems` | `MenuItem[]` | пункты навигации |

`MenuItem`: `{ path, isInternal, title, tasks? }`. Внутренние пункты
(`isInternal: true`) используют `routerLink` и подсветку активного пункта,
`tasks` рисует красный круглый бейдж.

### 3. Правая панель — `app-side-panel`

| Вход | Тип | Описание |
| --- | --- | --- |
| `title` | `string` | заголовок панели |

Контент проецируется через `<ng-content>`. Ширина — 320px, белый фон,
разделитель слева.

### 4. Футер — `app-footer`

Нижняя полоса с копирайтом и ссылками. Контент статичный (можно заменить
проекцией при необходимости).

### 5. Каркас — `app-shell`

Собирает всё в единый layout:

```
┌──────────────────────────────┐
│  app-common-header (шапка 1) │
├──────────────────────────────┤
│  app-page-header  (шапка 2)  │
├──────────────────────────┬───┤
│                          │   │
│  <ng-content> (main)     │ p │
│  (router-outlet)         │ a │
│                          │ n │
│                          │ e │
│                          │ l │
├──────────────────────────┴───┤
│  app-footer                  │
└──────────────────────────────┘
```

| Вход | Тип | Описание |
| --- | --- | --- |
| `employee` | `string` (required) | → шапка 1 |
| `title` | `string` (required) | → шапка 2 |
| `logoSrc` | `string` (required) | → шапка 2 |
| `menuItems` | `MenuItem[]` | → шапка 2 |

Слоты проекции:
- **по умолчанию** — основное содержимое (роутер-аутлет);
- **`[side-panel]`** — правая панель.

## Пример использования

```html
<app-shell
  [employee]="'Иванов Иван'"
  [title]="'Индивидуальный план развития'"
  [logoSrc]="'assets/logo.svg'"
  [menuItems]="menuItems"
>
  <router-outlet />

  <app-side-panel side-panel title="Сводка">
    <p>Содержимое правой панели</p>
  </app-side-panel>
</app-shell>
```

## Запуск

```bash
cd frontend
npm install
npm start        # http://localhost:4200
npm run build    # сборка в dist/frontend
```

## Источники

- Дизайн-токены, шрифты и иконки — из `../package` (`@cft/ui-lib`):
  `core/src/theme/theme.scss`, `assets/`.
- Компоненты `common-header` и `app-layout` пакета — референс для двух шапок.
