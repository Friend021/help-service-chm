import { Component, input, output, computed, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatCardModule } from '@angular/material/card';
import { CdkDrag } from '@angular/cdk/drag-drop';
import { IdpDirection, IdpTask, DevelopmentDirection, Dictionaries, ValidationError } from '../../../models/idp.models';
import { TaskEditorComponent } from '../task-editor/task-editor.component';

@Component({
  selector: 'app-direction-card',
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
    MatCardModule,
    TaskEditorComponent,
    CdkDrag,
  ],
  template: `
    <mat-card
      id="direction-card-{{ index() }}"
      class="direction-card idp-direction-card idp-direction"
      appearance="outlined"
      cdkDrag
      [cdkDragDisabled]="!reorderable()"
      [class.field-flash]="flashingId() === 'direction-card-' + index()"
    >
      <div class="idp-direction-header">
        <div class="idp-direction-header__top">
          <h3 class="idp-direction-header__title">Направление развития {{ index() + 1 }}</h3>
          @if (reorderable()) {
            <mat-icon class="idp-direction-header__drag" cdkDragHandle matTooltip="Перетащить" aria-label="Перетащить направление">drag_indicator</mat-icon>
          }
        </div>

        <div class="idp-direction-header__controls">
          <div
            class="idp-direction-goal"
            [class.field-flash]="flashingId() === 'direction-goal-' + index()"
          >
            <mat-form-field
              appearance="outline"
              class="idp-direction-goal__field"
              subscriptSizing="dynamic"
              [class.field-invalid]="isInvalid('direction-goal-' + index())"
            >
              <mat-select
                id="direction-goal-{{ index() }}"
                [value]="direction().goal"
                (selectionChange)="onGoalChange($event.value)"
                aria-label="Направление развития"
                [attr.aria-invalid]="isInvalid('direction-goal-' + index())"
                [attr.aria-describedby]="isInvalid('direction-goal-' + index()) ? 'direction-goal-' + index() + '-error' : null"
              >
                @for (d of dictionaries().directions; track d) {
                  <mat-option [value]="d">{{ d }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
            @if (isInvalid('direction-goal-' + index())) {
              <div
                id="direction-goal-{{ index() }}-error"
                class="field-error"
                role="alert"
              >Укажите направление развития</div>
            }
          </div>

          <div class="idp-direction-priority">
            <mat-form-field
              appearance="outline"
              class="idp-direction-priority__field"
              subscriptSizing="dynamic"
            >
              <mat-select
                [value]="direction().rank"
                (selectionChange)="onPriorityChange($event.value)"
                aria-label="Приоритет"
              >
                <mat-select-trigger>
                  <span
                    class="idp-direction-priority__trigger"
                    [class.is-high]="selectedPriorityLabel() === 'Высокий'"
                  >Приоритет: {{ selectedPriorityLabel() }}</span>
                </mat-select-trigger>
                @for (p of dictionaries().priorities; track p.rank) {
                  <mat-option [value]="p.rank">Приоритет: {{ p.label }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
          </div>
        </div>

        <p class="idp-direction-header__caption">
          Напишите что важно развить внутри выбранного направления
        </p>

        <div
          class="idp-direction-description"
          [class.field-flash]="flashingId() === 'direction-description-' + index()"
        >
          <mat-form-field
            appearance="outline"
            class="idp-direction-description__field"
            subscriptSizing="dynamic"
            [class.field-invalid]="isInvalid('direction-description-' + index())"
          >
            <textarea
              id="direction-description-{{ index() }}"
              matInput
              [value]="direction().description"
              (input)="onDescriptionChange($event)"
              rows="3"
              aria-label="Описание направления"
              [attr.aria-invalid]="isInvalid('direction-description-' + index())"
              [attr.aria-describedby]="isInvalid('direction-description-' + index()) ? 'direction-description-' + index() + '-error' : null"
            ></textarea>
          </mat-form-field>
          @if (isInvalid('direction-description-' + index())) {
            <div
              id="direction-description-{{ index() }}-error"
              class="field-error"
              role="alert"
            >Укажите описание направления</div>
          }
        </div>
      </div>

      <mat-card-content>
        <div class="idp-tasks-header">
          <span class="idp-tasks-header__title">Конкретные действия ({{ direction().tasks.length }})</span>
          <span class="idp-tasks-header__divider"></span>
          <button
            mat-icon-button
            class="idp-tasks-header__add"
            (click)="onAddTask()"
            matTooltip="Добавить действие"
          >
            <mat-icon>add</mat-icon>
          </button>
        </div>

        @for (task of direction().tasks; track $index) {
          <app-task-editor
            [task]="task"
            [dirIndex]="index()"
            [taskIndex]="$index"
            [dictionaries]="dictionaries()"
            [errors]="taskErrors()?.get($index) ?? []"
            [invalidFields]="invalidFields()"
            [flashingId]="flashingId()"
            [collapsed]="collapsedTasks().has(index() + '-' + $index)"
            (toggleCollapse)="onToggleTaskCollapse($index)"
            (update)="onTaskUpdate($event)"
            (delete)="onTaskDelete($event)"
          />
        }

        @if (direction().tasks.length === 0) {
          <p
            class="idp-no-tasks"
            [class.field-flash]="flashingId() === 'direction-card-' + index()"
          >Нет действий. Нажмите «+» чтобы добавить.</p>
        }
      </mat-card-content>

      <mat-card-actions align="end">
        <button mat-button (click)="onDelete()" color="warn">
          <mat-icon>delete</mat-icon>
          Удалить направление
        </button>
      </mat-card-actions>
    </mat-card>
  `,
  styles: [`
    :host {
      --field-gap-y: 24px;
      --field-gap-x: 16px;
    }

    @media (max-width: 900px) {
      :host {
        --field-gap-y: 12px;
        --field-gap-x: 8px;
      }
    }

    .direction-card {
      position: relative;
      margin-bottom: var(--field-gap-y);
      background: var(--idp-rail-card);
      /* Compact 40px field scale. */
      --mat-form-field-container-height: 40px;
      --mat-form-field-container-vertical-padding: 8px;
    }

    /* Drag handle: grab cursor while pressing the drag_indicator icon. */
    .idp-direction-header__drag {
      cursor: grab;
      user-select: none;
      -webkit-user-select: none;
    }

    .idp-direction-header__drag:active {
      cursor: grabbing;
    }

    /* Subtle lift for the card being dragged (CDK adds this class while animating). */
    .idp-direction-card.cdk-drag-animating {
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18);
    }

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

    .full-width {
      width: 100%;
    }
  `],
})
export class DirectionCardComponent {
  direction = input.required<IdpDirection>();
  index = input.required<number>();
  dictionaries = input.required<Dictionaries>();
  /** taskIndex → ValidationError[] scoped to this direction's tasks (422 mapping, D-3r #8). */
  taskErrors = input<Map<number, ValidationError[]> | null>(null);
  /** Set of invalid field ids passed from the parent draft (client-side required-field validation). */
  invalidFields = input<Set<string> | null>(null);
  /** Id of the field currently receiving the short flash highlight. */
  flashingId = input<string | null>(null);
  /** Keys `${dirIndex}-${taskIndex}` of tasks currently collapsed in this direction. */
  collapsedTasks = input<ReadonlySet<string>>(new Set());
  /** Можно ли перетаскивать карточку (reorder). На экране подтверждения — нет. */
  reorderable = input<boolean>(true);

  toggleTaskCollapse = output<{ dirIndex: number; taskIndex: number }>();

  selectedPriorityLabel = computed(() => {
    const rank = this.direction().rank;
    return this.dictionaries().priorities.find(p => p.rank === rank)?.label ?? '—';
  });

  private isInvalid = (fieldId: string): boolean => this.invalidFields()?.has(fieldId) ?? false;

  update = output<{ dirIndex: number; partial: Partial<IdpDirection> }>();
  delete = output<number>();
  addTask = output<number>();
  taskUpdate = output<{ dirIndex: number; taskIndex: number; partial: Partial<IdpTask> }>();
  taskDelete = output<{ dirIndex: number; taskIndex: number }>();

  onPriorityChange(rank: number): void {
    this.update.emit({ dirIndex: this.index(), partial: { rank: rank as 0 | 1 | 2 } });
  }

  onGoalChange(goal: string): void {
    this.update.emit({ dirIndex: this.index(), partial: { goal: goal as DevelopmentDirection } });
  }

  onDescriptionChange(event: Event): void {
    const value = (event.target as HTMLTextAreaElement).value;
    this.update.emit({ dirIndex: this.index(), partial: { description: value } });
  }

  onAddTask(): void {
    this.addTask.emit(this.index());
  }

  onTaskUpdate(event: { dirIndex: number; taskIndex: number; partial: Partial<IdpTask> }): void {
    this.taskUpdate.emit(event);
  }

  onTaskDelete(event: { dirIndex: number; taskIndex: number }): void {
    this.taskDelete.emit(event);
  }

  onToggleTaskCollapse(taskIndex: number): void {
    this.toggleTaskCollapse.emit({ dirIndex: this.index(), taskIndex });
  }

  onDelete(): void {
    this.delete.emit(this.index());
  }
}
