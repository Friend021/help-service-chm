import { Component, input, output, computed, signal, ChangeDetectionStrategy, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TextFieldModule } from '@angular/cdk/text-field';
import { IdpTask, DevelopmentTool, Dictionaries, ValidationError } from '../../../models/idp.models';
import { toIsoUtcDeadline, parseDeadline } from '../../../shared/utils/deadline';

/**
 * Splits both error-path notations returned for 422 payloads:
 * `plan.directions.0.tasks.1.deadLine` (openapi.dot) and
 * `plan.directions[0].tasks[1].deadLine` (bracket) → same segments.
 */
export function planPathSegments(path: string): string[] {
  return path.split(/[.\[\]]+/).filter(Boolean);
}

/**
 * Placeholder copy pending a real dictionary endpoint.
 * Two neutral sentences per known development tool plus a generic fallback.
 */
const TOOL_HINTS: Record<string, string> = {
  'Развитие на рабочем месте':
    'Этот инструмент помогает отрабатывать навыки непосредственно в рабочем процессе. ' +
    'Сотрудник получает обратную связь от коллег и закрепляет результат на практике.',
  'Развитие через других':
    'Обучение у наставника или коллеги позволяет быстрее осваивать новые компетенции. ' +
    'Важно заранее договориться о формате встреч и ожидаемом результате.',
  'Развитие через рабочие курсы':
    'Курсы дают структурированную теорию и упражнения по выбранной теме. ' +
    'Рекомендуется сразу закреплять изученное на рабочих задачах.',
  __fallback__:
    'Выберите инструмент развития, чтобы увидеть краткое описание. ' +
    'Подробные рекомендации будут добавлены после подключения справочника.',
};

@Component({
  selector: 'app-task-editor',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    MatIconModule,
    MatButtonModule,
    MatSelectModule,
    MatFormFieldModule,
    MatInputModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatTooltipModule,
    TextFieldModule,
  ],
  template: `
    <div
      class="task-editor idp-task-card"
      [class.field-flash]="flashingId() === 'task-card-' + dirIndex() + '-' + taskIndex()"
    >
      <div class="idp-task-header">
        <button
          type="button"
          class="idp-task-header__toggle"
          [attr.aria-expanded]="!collapsed"
          [attr.aria-controls]="'task-body-' + dirIndex() + '-' + taskIndex()"
          (click)="toggleCollapse.emit()"
        >
          <h4 class="idp-task-header__title">
            Действие {{ taskIndex() + 1 }}
            @if (hasAnyValidationIssue() && collapsed) {
              <mat-icon
                class="idp-task-header__warning"
                aria-hidden="true"
              >warning</mat-icon>
            }
          </h4>
          <mat-icon
            class="idp-task-header__chevron"
            [class.is-collapsed]="collapsed"
          >expand_more</mat-icon>
        </button>
        <span class="idp-task-header__divider"></span>
        <button
          mat-icon-button
          class="idp-task-header__delete"
          (click)="onDelete()"
          matTooltip="Удалить действие"
        >
          <mat-icon>delete</mat-icon>
        </button>
      </div>

      @if (!collapsed) {
        <div class="idp-task-body" [id]="'task-body-' + dirIndex() + '-' + taskIndex()">
          <div class="idp-task-fields">
        <div
          class="idp-task-tool"
          [class.field-flash]="flashingId() === 'tool-' + dirIndex() + '-' + taskIndex()"
        >
          <div class="idp-task-tool__row">
            <mat-form-field
              appearance="outline"
              class="idp-task-tool__field"
              subscriptSizing="dynamic"
              [class.field-invalid]="isInvalid('tool')"
            >
              <mat-select
                id="tool-{{ dirIndex() }}-{{ taskIndex() }}"
                [value]="task().developmentTool"
                (selectionChange)="onToolChange($event.value)"
                aria-label="Инструмент развития"
                [attr.aria-invalid]="isInvalid('tool')"
                [attr.aria-describedby]="isInvalid('tool') ? 'tool-' + dirIndex() + '-' + taskIndex() + '-error' : null"
              >
                @for (tool of dictionaries().tools ?? []; track tool) {
                  <mat-option [value]="tool">{{ tool }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
            <mat-icon
              class="idp-task-tool__info"
              #toolTip="matTooltip"
              [matTooltip]="toolHint(task().developmentTool)"
              matTooltipPosition="above"
              [matTooltipHideDelay]="4000"
              (click)="toolTip.toggle()"
              (keydown.enter)="toolTip.toggle()"
              (keydown.space)="toolTip.toggle(); $event.preventDefault()"
              tabindex="0"
              role="button"
              aria-label="Подсказка по инструменту развития"
            >info_outline</mat-icon>
          </div>
          @if (fieldErrorOrMessage('tool', 'Укажите инструмент развития'); as error) {
            <div
              id="tool-{{ dirIndex() }}-{{ taskIndex() }}-error"
              class="field-error"
              role="alert"
            >{{ error }}</div>
          }
        </div>

        <div
          class="idp-task-deadline"
          [class.field-flash]="flashingId() === 'deadline-' + dirIndex() + '-' + taskIndex()"
        >
          <mat-form-field
            appearance="outline"
            class="idp-task-deadline__field"
            subscriptSizing="dynamic"
            [class.field-invalid]="isInvalid('deadline')"
          >
            <input
              id="deadline-{{ dirIndex() }}-{{ taskIndex() }}"
              matInput
              [matDatepicker]="picker"
              [value]="deadlineDate()"
              (dateChange)="onDeadlineChange($event.value)"
              aria-label="Срок выполнения"
              [attr.aria-invalid]="isInvalid('deadline')"
              [attr.aria-describedby]="isInvalid('deadline') ? 'deadline-' + dirIndex() + '-' + taskIndex() + '-error' : null"
            >
            <mat-datepicker-toggle matIconSuffix [for]="picker"></mat-datepicker-toggle>
            <mat-datepicker #picker></mat-datepicker>
          </mat-form-field>
          @if (fieldErrorOrMessage('deadline', 'Укажите срок выполнения'); as error) {
            <div
              id="deadline-{{ dirIndex() }}-{{ taskIndex() }}-error"
              class="field-error"
              role="alert"
            >{{ error }}</div>
          }
        </div>
      </div>

      <div
        class="idp-task-description"
        [class.field-flash]="flashingId() === 'description-' + dirIndex() + '-' + taskIndex()"
      >
        <label class="field-label" for="description-{{ dirIndex() }}-{{ taskIndex() }}">
          Опишите, что именно предстоит делать <span aria-hidden="true">*</span>
        </label>
        <mat-form-field
          appearance="outline"
          class="idp-task-description__field"
          subscriptSizing="dynamic"
          [class.field-invalid]="isInvalid('description')"
        >
          <textarea
            id="description-{{ dirIndex() }}-{{ taskIndex() }}"
            matInput
            cdkTextareaAutosize
            cdkAutosizeMinRows="2"
            cdkAutosizeMaxRows="8"
            [value]="task().description"
            (input)="onDescriptionChange($event)"
            aria-label="Описание действия"
            [attr.aria-invalid]="isInvalid('description')"
            [attr.aria-describedby]="isInvalid('description') ? 'description-' + dirIndex() + '-' + taskIndex() + '-error' : null"
          ></textarea>
        </mat-form-field>
        @if (fieldErrorOrMessage('description', 'Укажите описание действия'); as error) {
          <div
            id="description-{{ dirIndex() }}-{{ taskIndex() }}-error"
            class="field-error"
            role="alert"
          >{{ error }}</div>
        }
      </div>

      <div class="idp-task-comment">
        <button
          type="button"
          class="idp-task-comment__toggle"
          (click)="commentExpanded.set(!commentExpanded())"
          [attr.aria-expanded]="showComment()"
          [attr.aria-controls]="'comment-' + dirIndex() + '-' + taskIndex()"
        >
          <mat-icon class="idp-task-comment__chevron" [class.is-open]="showComment()">chevron_right</mat-icon>
          <span class="field-label">Комментарий сотрудника</span>
          @if (commentMeta(); as meta) {
            <span class="idp-task-comment__meta">{{ meta.date }} {{ meta.author }}</span>
          }
        </button>
        @if (showComment()) {
          <mat-form-field
            appearance="outline"
            class="idp-task-comment__field"
            subscriptSizing="dynamic"
            [class.field-invalid]="fieldError('comment') !== undefined"
          >
            <textarea
              id="comment-{{ dirIndex() }}-{{ taskIndex() }}"
              matInput
              [value]="task().comment"
              (input)="onCommentChange($event)"
              rows="3"
              aria-label="Комментарий сотрудника"
              [attr.aria-invalid]="fieldError('comment') !== undefined"
              [attr.aria-describedby]="fieldError('comment') !== undefined ? 'comment-' + dirIndex() + '-' + taskIndex() + '-error' : null"
            ></textarea>
          </mat-form-field>
          @if (fieldError('comment'); as error) {
            <div
              id="comment-{{ dirIndex() }}-{{ taskIndex() }}-error"
              class="field-error"
              role="alert"
            >{{ error.message }}</div>
          }
        }
      </div>
      </div>
      }
    </div>
  `,
  styles: [`
    :host {
      --field-gap-y: 24px;
      --field-gap-x: 16px;
    }

    /* Инструмент развития + иконка-подсказка «i» справа; тултип по клику на иконку. */
    .idp-task-tool__row {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .idp-task-tool__row .idp-task-tool__field {
      flex: 1 1 auto;
      min-width: 0;
    }

    .idp-task-tool__info {
      flex: 0 0 auto;
      cursor: pointer;
      color: var(--mat-sys-on-surface-variant);
      font-size: 20px;
      width: 20px;
      height: 20px;
      outline: none;
    }

    .idp-task-tool__info:hover,
    .idp-task-tool__info:focus-visible {
      color: var(--mat-sys-primary);
    }

    /* Свёрнутый по умолчанию комментарий сотрудника: кликабельный заголовок-переключатель. */
    .idp-task-comment__toggle {
      display: flex;
      align-items: center;
      gap: 6px;
      width: 100%;
      padding: 4px 0;
      background: none;
      border: none;
      cursor: pointer;
      color: var(--mat-sys-on-surface);
      text-align: left;
    }

    .idp-task-comment__chevron {
      flex: 0 0 auto;
      font-size: 18px;
      width: 18px;
      height: 18px;
      color: var(--mat-sys-on-surface-variant);
      transition: transform 0.15s ease;
    }

    .idp-task-comment__chevron.is-open {
      transform: rotate(90deg);
    }

    .idp-task-comment__toggle:hover .field-label {
      color: var(--mat-sys-primary);
    }

    @media (max-width: 900px) {
      :host {
        --field-gap-y: 12px;
        --field-gap-x: 8px;
      }
    }

    .task-editor {
      /* Compact 40px field scale, matching the plan card / direction card. */
      --mat-form-field-container-height: 40px;
      --mat-form-field-container-vertical-padding: 8px;
    }

    /* 422 field mapping: outline + message under the offending field. */
    .field-error {
      color: var(--mat-sys-error);
      font-size: 0.75rem;
      line-height: 1.2;
      margin-top: 2px;
      padding: 0 14px;
    }

    .field-invalid {
      --mdc-outlined-text-field-outline-color: var(--mat-sys-error);
      --mdc-outlined-text-field-focus-outline-color: var(--mat-sys-error);
    }

    .field-flash {
      animation: field-flash 0.6s ease;
    }

    @keyframes field-flash {
      0%, 100% { box-shadow: none; }
      50% { box-shadow: 0 0 0 2px var(--mat-sys-error); }
    }
  `],
})
export class TaskEditorComponent {
  task = input.required<IdpTask>();
  dirIndex = input.required<number>();
  taskIndex = input.required<number>();
  dictionaries = input.required<Dictionaries>();
  /** ValidationErrors ({path, message}) already scoped to THIS task by the parent (422 mapping). */
  errors = input<ValidationError[]>([]);
  /** Set of invalid field ids passed from the parent draft (client-side required-field validation). */
  invalidFields = input<Set<string> | null>(null);
  /** Id of the field currently receiving the short flash highlight. */
  flashingId = input<string | null>(null);

  update = output<{ dirIndex: number; taskIndex: number; partial: Partial<IdpTask> }>();
  delete = output<{ dirIndex: number; taskIndex: number }>();

  /** Whether this task is currently collapsed; controlled by the parent so the banner can expand before scrolling. */
  @Input() collapsed = false;
  /** Request the parent to toggle this task's collapsed state. */
  @Output() toggleCollapse = new EventEmitter<void>();

  private readonly datePipe = new DatePipe('ru-RU');

  /** Комментарий сотрудника по умолчанию свёрнут (экономит место), разворачивается по клику. */
  readonly commentExpanded = signal(false);
  /** Поле комментария видно: раскрыто пользователем, уже заполнено или есть ошибка валидации. */
  readonly showComment = computed(() =>
    this.commentExpanded()
    || (this.task().comment ?? '').trim().length > 0
    || this.fieldError('comment') !== undefined
  );

  /** True when at least one of this task's required fields is invalid (client-side or server-side). */
  hasAnyValidationIssue = computed(() => {
    const prefixes = ['tool', 'deadline', 'description'];
    return prefixes.some(p => this.isInvalid(p));
  });

  /** ValidationError that targets one of this task's fields via its path tail. */
  fieldError(field: string): ValidationError | undefined {
    return this.errors().find(error => planPathSegments(error.path).at(-1) === field);
  }

  /** True when a field is invalid either from the server (422) or from local required-field validation. */
  isInvalid(fieldPrefix: string): boolean {
    const fieldId = `${fieldPrefix}-${this.dirIndex()}-${this.taskIndex()}`;
    return this.fieldError(this.serverFieldName(fieldPrefix)) !== undefined || (this.invalidFields()?.has(fieldId) ?? false);
  }

  /** Returns the server error message, the local default message, or null if the field is valid. */
  fieldErrorOrMessage(fieldPrefix: string, defaultMessage: string): string | null {
    const server = this.fieldError(this.serverFieldName(fieldPrefix));
    if (server) return server.message;
    const fieldId = `${fieldPrefix}-${this.dirIndex()}-${this.taskIndex()}`;
    if (this.invalidFields()?.has(fieldId)) return defaultMessage;
    return null;
  }

  /** Formatted comment meta; hidden when both date and author are empty. */
  commentMeta = computed(() => {
    const author = this.task().commentAuthor;
    const date = this.formatCommentDate(this.task().commentCreatedAt);
    if (!author && !date) return null;
    return { date: date ?? '', author: author ?? '' };
  });

  private serverFieldName(prefix: string): string {
    switch (prefix) {
      case 'tool': return 'developmentTool';
      case 'deadline': return 'deadLine';
      default: return prefix;
    }
  }

  private formatCommentDate(iso: string | undefined): string | null {
    if (!iso) return null;
    try {
      const date = new Date(iso.trim());
      if (Number.isNaN(date.getTime())) return null;
      return this.datePipe.transform(date, 'dd.MM.yyyy');
    } catch {
      return null;
    }
  }

  toolHint(tool: string): string {
    if (!tool) return TOOL_HINTS['__fallback__'] as string;
    return (TOOL_HINTS[tool] ?? TOOL_HINTS['__fallback__']) as string;
  }

  deadlineDate = computed(() => {
    const deadline = this.task().deadLine;
    if (!deadline) return null;
    try {
      // Pre-fill the datepicker with the picked *calendar day*: take the UTC
      // Y-M-D from the ISO string and rebuild it as a local date so the
      // MatNativeDateModule picker shows the same day regardless of timezone.
      const parsed = parseDeadline(deadline);
      return new Date(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate());
    } catch {
      return null;
    }
  });

  onToolChange(tool: string): void {
    this.update.emit({ dirIndex: this.dirIndex(), taskIndex: this.taskIndex(), partial: { developmentTool: tool as DevelopmentTool } });
  }

  onDeadlineChange(date: Date | null): void {
    if (date) {
      // Promote the local calendar day to UTC midnight so toIsoUtcDeadline
      // serializes the picked day (15.04 → 2026-04-15T00:00:00.000Z), keeping
      // the exact Z-suffixed ISO 8601 contract for backend date comparison.
      const picked = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
      const iso = toIsoUtcDeadline(picked);
      this.update.emit({ dirIndex: this.dirIndex(), taskIndex: this.taskIndex(), partial: { deadLine: iso } });
    }
  }

  onDescriptionChange(event: Event): void {
    const value = (event.target as HTMLInputElement | HTMLTextAreaElement).value;
    this.update.emit({ dirIndex: this.dirIndex(), taskIndex: this.taskIndex(), partial: { description: value } });
  }

  onCommentChange(event: Event): void {
    const value = (event.target as HTMLTextAreaElement).value;
    this.update.emit({ dirIndex: this.dirIndex(), taskIndex: this.taskIndex(), partial: { comment: value } });
  }

  onDelete(): void {
    this.delete.emit({ dirIndex: this.dirIndex(), taskIndex: this.taskIndex() });
  }
}
