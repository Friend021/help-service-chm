import { Component, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { IdpPlan, ValidationError } from '../../../models/idp.models';

export interface ExportDialogData {
  plan: IdpPlan;
  validationErrors: ValidationError[];
}

@Component({
  selector: 'app-export-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule, MatIconModule, MatListModule],
  template: `
    <div class="export-dialog">
      <h2 mat-dialog-title>
        <mat-icon>check_circle</mat-icon>
        Подтверждение экспорта
      </h2>

      <mat-dialog-content>
        <p>План готов к переносу в систему «План развития». Проверьте данные перед отправкой:</p>

        <div class="plan-summary">
          <div class="summary-item">
            <strong>Главная цель:</strong>
            <span>{{ plan().mainGoal || '— не указана' }}</span>
          </div>

          <div class="summary-item">
            <strong>Направлений:</strong>
            <span>{{ plan().directions.length }}</span>
          </div>

          <div class="summary-item">
            <strong>Всего действий:</strong>
            <span>{{ totalTasks() }}</span>
          </div>

          @if (validationErrors().length > 0) {
            <div class="validation-errors">
              <mat-icon color="warn">warning</mat-icon>
              <strong>Обнаружены ошибки валидации:</strong>
              <mat-list>
                @for (error of validationErrors(); track $index) {
                  <mat-list-item><span matListItemTitle>{{ error.message }}</span></mat-list-item>
                }
              </mat-list>
              <p class="warning-note">Экспорт с ошибками невозможен. Исправьте план перед отправкой.</p>
            </div>
          } @else {
            <div class="validation-success">
              <mat-icon color="primary">verified</mat-icon>
              <span>План проходит валидацию. Все поля заполнены корректно.</span>
            </div>
          }
        </div>
      </mat-dialog-content>

      <mat-dialog-actions align="end">
        <button mat-button (click)="close()">Отмена</button>
        <button
          mat-flat-button
          color="primary"
          [disabled]="validationErrors().length > 0"
          (click)="confirm()"
        >
          <mat-icon>send</mat-icon>
          Экспортировать
        </button>
      </mat-dialog-actions>
    </div>
  `,
  styles: [`
    .export-dialog {
      min-width: 400px;
      max-width: 500px;
    }

    h2[mat-dialog-title] {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 0;
      font-size: 1.25rem;
    }

    mat-dialog-content {
      margin: 16px 0;
    }

    .plan-summary {
      margin-top: 16px;
    }

    .summary-item {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      border-bottom: 1px solid var(--mat-sys-outline-variant);
    }

    .summary-item:last-child {
      border-bottom: none;
    }

    .validation-errors {
      margin-top: 16px;
      padding: 12px;
      background: var(--mat-sys-error-container);
      border-radius: 8px;
      color: var(--mat-sys-on-error-container);
    }

    .validation-errors mat-icon {
      margin-right: 8px;
    }

    .validation-errors mat-list {
      margin: 8px 0;
      padding: 0;
    }

    .warning-note {
      margin: 8px 0 0 0;
      font-size: 0.875rem;
      opacity: 0.8;
    }

    .validation-success {
      margin-top: 16px;
      padding: 12px;
      background: var(--mat-sys-primary-container);
      border-radius: 8px;
      color: var(--mat-sys-on-primary-container);
      display: flex;
      align-items: center;
      gap: 8px;
    }

    mat-dialog-actions {
      padding: 8px 0 0 0;
    }
  `],
})
export class ExportDialogComponent {
  private readonly dialogRef = inject(MatDialogRef<ExportDialogComponent>);
  private readonly data = inject<ExportDialogData>(MAT_DIALOG_DATA);

  plan = computed(() => this.data.plan);
  validationErrors = computed(() => this.data.validationErrors);

  totalTasks = computed(() =>
    this.plan().directions.reduce((sum, d) => sum + d.tasks.length, 0)
  );

  close(): void {
    this.dialogRef.close(false);
  }

  confirm(): void {
    this.dialogRef.close(true);
  }
}